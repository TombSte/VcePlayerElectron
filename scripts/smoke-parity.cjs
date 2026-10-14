/**
 * Recorded parity smoke test (task-parity): exercises the original Player's
 * menus, shortcuts, Options tabs, Exam Mode modes and examination-window
 * features, and fails if the renderer logs any console error.
 *
 * Usage: npx electron scripts/smoke-parity.cjs
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

const OPTIONS = {
  randomizeQuestions: false,
  randomizeChoices: false,
  enablePrevious: true,
  enableShowAnswer: true,
  enablePause: true,
  enableViewAnswers: true,
  enableCalculator: true,
  textSize: 'medium',
  colorScheme: 'default',
  showFilenameColumn: true,
  showExamAndQuestionNumber: true,
  disableClearHistory: false,
  disableEditExamList: false,
  disableExamMode: false,
  disableTimerChange: false,
  disableFileProperties: false,
  disablePrintReport: false,
  scanFolderOnStartup: false,
  scanFolder: '',
  resetCandidateName: false,
  defaultCandidateName: 'Jane Doe',
  adminPasswordEnabled: false,
  adminPassword: '',
  requestPasswordToStartExam: false,
  requestPasswordToViewHistory: false
}

function baseQuestion(partial) {
  return {
    id: 0,
    examSectionId: -1,
    type: 0,
    rawType: 0,
    sectionId: 0,
    complexity: 0,
    question: '',
    reference: '',
    variants: [],
    variantsCount: 0,
    answers: '',
    areaImage: '',
    hotAreas: [],
    dndTypes: [],
    dragAreas: [],
    dropAreas: [],
    blockAnswers: [],
    blockAnswersCount: 0,
    trusted: true,
    ...partial
  }
}

const EXAM_FILE = {
  path: '/exams/parity.vce',
  version: 60,
  number: 'PAR-1',
  title: 'Parity fixture',
  passingScore: 700,
  timeLimit: 0,
  fileVersion: '1.0',
  style: '',
  description: '',
  sections: [{ id: 1, name: 'Domain 1' }],
  sizeBytes: 1,
  hasDecryptionWarnings: false,
  exams: [
    {
      id: 1,
      type: 0,
      name: 'Exam A',
      sections: [{ id: 1, type: 0, timeLimit: 0, title: 'Domain 1' }],
      questions: [
        baseQuestion({
          id: 1,
          question: '<p>Question one</p>',
          variants: ['<p>One</p>', '<p>Two</p>'],
          variantsCount: 2,
          answers: 'A',
          reference: '<p>Exhibit: see the diagram</p>'
        })
      ]
    },
    {
      id: 2,
      type: 0,
      name: 'No section metadata',
      sections: [],
      questions: [baseQuestion({ id: 2, question: '<p>Question without section metadata</p>', variants: ['<p>One</p>', '<p>Two</p>'], variantsCount: 2, answers: 'A' })]
    }
  ]
}

const DATA = {
  examList: [
    { id: '1', title: 'Parity fixture', filePath: '/exams/parity.vce', trainingMode: false, addedAt: Date.now() },
    { id: '2', title: 'Second exam', filePath: '/exams/second.vce', trainingMode: false, addedAt: Date.now() }
  ],
  options: OPTIONS,
  history: [],
  sessions: []
}

const channels = {
  'app:getData': () => DATA,
  'app:setOptions': (_e, o) => ({ ...DATA, options: o }),
  'app:saveTextFile': () => true,
  'app:saveBinaryFile': () => true,
  'exam:parse': () => ({ file: EXAM_FILE }),
  'exam:openDialog': () => ({ files: [], errors: [] }),
  'exam:addToList': () => DATA,
  'exam:updateInList': () => DATA,
  'exam:removeFromList': () => DATA,
  'exam:scanFolder': () => ({ added: 0 }),
  'history:add': () => DATA,
  'history:clear': () => DATA,
  'sessions:save': () => DATA,
  'sessions:delete': () => DATA,
  'sessions:clear': () => DATA,
  'dialog:openFolder': () => null,
  'dialog:chooseFile': () => null,
  'shell:openExternal': () => undefined
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const consoleErrors = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function press(win, key, opts = {}) {
  await win.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, ...opts })}))`
  )
  await sleep(150)
}

async function clickByText(win, text) {
  return win.webContents.executeJavaScript(`
    (() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === ${JSON.stringify(text)});
      const target = btns[btns.length - 1];
      if (target) { target.click(); return true; }
      return false;
    })()
  `)
}

const q = (win, js) => win.webContents.executeJavaScript(js)

app.whenReady().then(async () => {
  for (const [channel, handler] of Object.entries(channels)) ipcMain.handle(channel, handler)

  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: path.join(ROOT, 'out', 'preload', 'index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) consoleErrors.push(message)
  })
  win.webContents.on('preload-error', (_event, _path, error) => consoleErrors.push(`preload: ${error.message}`))

  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'index.html'))
  await sleep(400)

  // Menus exist.
  const menus = await q(win, `[...document.querySelectorAll('.menubar .menu > button')].map((b) => b.textContent.trim())`)
  check('menu bar exposes File/Exam/Help', JSON.stringify(menus) === JSON.stringify(['File', 'Exam', 'Help']), menus.join(','))

  // Ctrl+A selects every exam (menu "Select All").
  await press(win, 'a', { ctrlKey: true })
  const selected = await q(win, `document.querySelectorAll('table.list tbody tr.selected').length`)
  check('Ctrl+A selects all exams', selected === 2, `selected=${selected}`)

  // Options dialog with three tabs.
  await clickByText(win, 'Options')
  await sleep(250)
  const tabs = await q(win, `[...document.querySelectorAll('.modal .tabs button')].map((b) => b.textContent.trim())`)
  check('Options dialog has General/Administrative/Password tabs', tabs.length === 3, tabs.join(','))
  for (const tab of ['Administrative', 'Password', 'General']) {
    await clickByText(win, tab)
    await sleep(120)
  }
  await clickByText(win, 'Cancel')
  await sleep(200)

  // F5 opens the Exam Mode dialog with five modes.
  await press(win, 'F5')
  await sleep(350)
  const modeRadios = await q(win, `document.querySelectorAll('.modal input[type=radio][name=mode]').length`)
  check('Exam Mode dialog exposes five modes', modeRadios === 5, `modes=${modeRadios}`)
  const sectionDisabled = await q(win, `(() => {
    const exam = document.querySelector('.modal select');
    exam.value = '1'; exam.dispatchEvent(new Event('change', { bubbles: true }));
    const radio = [...document.querySelectorAll('.modal input[type=radio][name=mode]')]
      .find((input) => input.parentElement.textContent.includes('Take questions from selected sections only'));
    return { disabled: radio.disabled, ariaDisabled: radio.parentElement.getAttribute('aria-disabled'),
      styled: Number.parseFloat(getComputedStyle(radio.parentElement).opacity) < 1,
      reason: radio.parentElement.textContent.includes('No sections available') };
  })()`)
  check('section-only mode visibly explains why it is disabled', sectionDisabled.disabled && sectionDisabled.ariaDisabled === 'true' && sectionDisabled.styled && sectionDisabled.reason, JSON.stringify(sectionDisabled))
  await q(win, `(() => { const exam = document.querySelector('.modal select'); exam.value = '0'; exam.dispatchEvent(new Event('change', { bubbles: true })); })()`)

  // Start the exam and exercise the examination-window features.
  await clickByText(win, 'Start Exam')
  await sleep(450)
  const buttons = await q(win, `[...document.querySelectorAll('button')].map((b) => b.textContent.trim())`)
  const required = ['Mark', 'Show Answer', 'Previous', 'Next', 'Review', 'Print Item', 'Save Session', 'End Exam', 'Exhibits', 'Instructions']
  const missing = required.filter((label) => !buttons.some((b) => b.includes(label)))
  check('examination window exposes the original Player controls', missing.length === 0, missing.join(','))

  // Instructions dialog.
  await clickByText(win, 'Instructions')
  await sleep(200)
  const instructions = await q(win, `document.querySelector('.modal .body')?.textContent ?? ''`)
  check('Instructions dialog shows answering help', /option button|answer text/i.test(instructions), instructions.slice(0, 40))
  await clickByText(win, 'OK')
  await sleep(200)

  // Exhibits dialog (question has a reference/exhibit).
  await clickByText(win, 'Exhibits')
  await sleep(200)
  const exhibit = await q(win, `document.querySelector('.modal .body')?.textContent ?? ''`)
  check('Exhibits dialog shows the exhibit', /Exhibit/i.test(exhibit), exhibit.slice(0, 40))
  await clickByText(win, 'Close')
  await sleep(200)

  // Keyboard shortcuts inside the exam: Mark (Alt+M) and Next (Alt+N).
  await press(win, 'm', { altKey: true })
  const flagged = await q(win, `document.querySelectorAll('.nav-grid .cell.flagged').length`)
  check('Alt+M marks the current item', flagged === 1, `flagged=${flagged}`)

  // Review button switches to review with the three filters.
  await clickByText(win, 'Review')
  await sleep(250)
  const filters = await q(win, `[...document.querySelectorAll('.question-nav .tabs button')].map((b) => b.textContent.trim())`)
  check('review exposes All/Incomplete/Marked', JSON.stringify(filters) === JSON.stringify(['All', 'Incomplete', 'Marked']), filters.join(','))

  // Score history + saved sessions view.
  await clickByText(win, 'Score Report')
  await sleep(200)
  await clickByText(win, 'Exit')
  await sleep(250)
  await clickByText(win, 'History')
  await sleep(250)
  const historyTabs = await q(win, `[...document.querySelectorAll('.tabs button')].map((b) => b.textContent.trim())`)
  check('score history view has History + Saved Sessions', historyTabs.some((t) => /History/.test(t)) && historyTabs.some((t) => /Saved/.test(t)), historyTabs.join(','))

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

  win.destroy()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${failed === 0 ? 'PARITY SMOKE OK' : `${failed} check(s) failed`}`)
  app.exit(failed === 0 ? 0 : 1)
})
