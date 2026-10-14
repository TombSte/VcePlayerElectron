/**
 * Tests the actual packaged executable with real IPC, storage and a real .vce.
 * Usage: node scripts/smoke-packaged.cjs <executable> <readable.vce> [report.json]
 * Requires Node >= 22 (built-in WebSocket). Never uses the user's app profile.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn, description, timeout = 30000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) { lastError = error }
    await sleep(100)
  }
  throw new Error(`Timeout: ${description}${lastError ? ` (${lastError.message})` : ''}`)
}
async function freePort() {
  const server = net.createServer()
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}
async function connect(url, errors) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data))
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      errors.push(detail.exception?.description || detail.text)
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error(`CDP timeout: ${method}`))
    }, 15000)
    pending.set(requestId, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  return { evaluate, close: () => socket.close() }
}

async function main() {
  const [executableArg, examArg, reportArg] = process.argv.slice(2)
  assert(executableArg && examArg, 'Usage: node scripts/smoke-packaged.cjs <executable> <readable.vce> [report.json]')
  const executable = path.resolve(executableArg)
  const examPath = path.resolve(examArg)
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'vce-packaged-'))
  const errors = []
  const checks = []
  const report = {
    timestamp: new Date().toISOString(), platform: process.platform, arch: process.arch,
    executable, examPath, examSha256: createHash('sha256').update(await fs.readFile(examPath)).digest('hex'),
    checks, errors, ok: false
  }
  let child, client
  let stderr = ''
  const check = (name, detail) => { checks.push({ name, detail, ok: true }); console.log(`PASS ${name}`) }
  try {
    const port = await freePort()
    child = spawn(executable, [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, examPath], {
      env: { ...process.env, ELECTRON_RENDERER_URL: '', ELECTRON_RUN_AS_NODE: '' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child.on('error', (error) => errors.push(error.message))
    child.stdout.on('data', () => {})
    child.stderr.on('data', (data) => { stderr = (stderr + data).slice(-20000) })
    const target = await until(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      return targets.find((target) => target.type === 'page' && target.url.startsWith('file:'))
    }, 'packaged renderer')
    check('packaged app launches its file:// renderer', target.url)
    client = await connect(target.webSocketDebuggerUrl, errors)
    const q = client.evaluate
    const data = await until(async () => {
      const value = await q('window.api && window.api.getData()')
      return value?.examList?.some((entry) => entry.filePath === examPath) && value
    }, 'startup .vce arrives through real preload/IPC')
    assert.equal(data.examList.length, 1, 'Startup open must not insert duplicate exams')
    check('startup command-line .vce opens once', data.examList[0].title)
    const rows = await until(() => q(`document.querySelectorAll('table.list tbody tr.selected').length`), 'exam selected in UI')
    assert.equal(rows, 1)
    check('opened exam is selected in renderer')
    // Keep CDP results bounded: large specimens contain multi-MB base64 images.
    const parsed = await q(`(async () => {
      const parsed = await window.api.parseExam(${JSON.stringify(examPath)});
      return { error: parsed.error, file: parsed.file && {
        version: parsed.file.version, hasDecryptionWarnings: parsed.file.hasDecryptionWarnings,
        exams: parsed.file.exams.map(exam => ({ questions: exam.questions.map(question => ({
          trusted: question.trusted, question: question.question.trim() ? '[nonempty]' : '',
          areaImage: !!question.areaImage, hotAreas: { length: question.hotAreas.length }
        })) }))
      } };
    })()`)
    assert(parsed.file && !parsed.error, JSON.stringify(parsed.error))
    const questions = parsed.file.exams.flatMap((exam) => exam.questions)
    assert(questions.length > 0)
    assert(!parsed.file.hasDecryptionWarnings && questions.every((question) => question.trusted && question.question.trim()))
    check('real reader returns nonempty trusted questions', { version: parsed.file.version, questions: questions.length })
    const click = async (text) => {
      assert(await q(`(() => { const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${JSON.stringify(text)}); const b = buttons[buttons.length - 1]; if (!b || b.disabled) return false; b.click(); return true })()`), `Button not found: ${text}`)
    }
    await click('Options')
    const tabs = await until(() => q(`(() => { const tabs = [...document.querySelectorAll('.modal .tabs button')].map(b => b.textContent.trim()); return tabs.length === 3 && tabs })()`), 'Options tabs')
    assert.deepEqual(tabs, ['General', 'Administrative', 'Password'])
    await click('Cancel')
    check('Options dialog works through packaged app', tabs)
    await q(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'F5', bubbles:true}))`)
    await until(() => q(`document.querySelectorAll('.modal input[type=radio][name=mode]').length === 5`), 'Exam Mode dialog')
    check('F5 opens five exam modes')
    await click('Start Exam')
    await until(() => q(`!!document.querySelector('.nav-grid .cell')`), 'examination window')
    const buttons = await q(`[...document.querySelectorAll('button')].map(b => b.textContent.trim())`)
    for (const control of ['Mark', 'Show Answer', 'Previous', 'Next', 'Review', 'Save Session', 'End Exam']) {
      assert(buttons.some((button) => button.includes(control)), `Missing exam control: ${control}`)
    }
    check('real exam starts with expected controls')
    if (parsed.file.version === 31) {
      const graphicIndex = questions.findIndex((question) => question.areaImage && question.hotAreas.length)
      assert(graphicIndex >= 0, 'Legacy specimen must contain an interactive image')
      assert(await q(`(() => { const cell = document.querySelectorAll('.nav-grid .cell')[${graphicIndex}]; if (!cell) return false; cell.click(); return true })()`))
      const image = await until(() => q(`(() => { const img = document.querySelector('.hotarea-stage img'); return img?.complete && img.naturalWidth > 0 && {width: img.naturalWidth, height: img.naturalHeight} })()`), 'legacy hot-area image decodes in Chromium')
      assert.equal(await q(`document.querySelectorAll('.hotarea-stage .hotarea').length`), questions[graphicIndex].hotAreas.length)
      await q(`document.querySelector('.hotarea-stage .hotarea').click()`)
      assert.equal(await q(`document.querySelectorAll('.hotarea-stage .hotarea.selected').length`), 1)
      await q(`document.querySelectorAll('.nav-grid .cell')[0].click()`)
      check('legacy hot-area image renders and accepts an answer', image)
    }
    await q(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'m', altKey:true, bubbles:true}))`)
    await until(() => q(`document.querySelectorAll('.nav-grid .cell.flagged').length === 1`), 'marked question')
    check('Alt+M marks real question')
    await click('Save Session')
    const saved = await until(async () => { const value = await q('window.api.getData()'); return value.sessions.length === 1 && value }, 'saved session persistence')
    check('real session persists through electron-store', { sessions: saved.sessions.length })
    const config = JSON.parse(await fs.readFile(path.join(profile, 'vce-player.json'), 'utf8'))
    assert.equal(config.examList.length, 1)
    assert.equal(config.sessions.length, 1)
    check('storage isolated to temporary profile')
    assert.deepEqual(errors, [], 'Renderer console/runtime errors')
    check('no renderer console/runtime errors')
    report.ok = true
  } catch (error) {
    report.failure = error.stack
    report.stderr = stderr
    throw error
  } finally {
    client?.close()
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    await fs.rm(profile, { recursive: true, force: true })
    if (reportArg) {
      const reportPath = path.resolve(reportArg)
      await fs.mkdir(path.dirname(reportPath), { recursive: true })
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
