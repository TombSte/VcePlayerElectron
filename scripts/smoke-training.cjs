/** Training-mode regression: built React renderer + real preload, synthetic IPC fixtures. */
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vce-training-'))
app.setPath('userData', profile)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>')}`
const names = ['SingleChoice', 'MultipleChoice', 'DragAndDrop', 'PointAndShoot', 'CreateATree', 'BuildListAndReorder', 'DropAndConnect', 'CaseStudy', 'FillInTheBlank', 'HotArea']
const placement = new Set([2, 4, 5, 6])
const questions = names.map((name, type) => ({
  id: type + 1, examSectionId: -1, type, rawType: type, sectionId: 0, complexity: 0,
  question: `<p>Training: ${name}</p>`, reference: '', variants: ['First', 'Second'], variantsCount: 2,
  answers: placement.has(type) ? '2,1' : [3, 9].includes(type) ? '2' : type === 8 ? 'correct' : 'B',
  areaImage: [3, 9].includes(type) ? svg : '',
  hotAreas: [{ x: 0, y: 0, width: 50, height: 50 }, { x: 50, y: 50, width: 50, height: 50 }],
  dndTypes: [], dragAreas: [], dropAreas: placement.has(type) ? [{ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }] : [],
  blockAnswers: type === 8 ? ['correct'] : [], blockAnswersCount: type === 8 ? 1 : 0, trusted: true
}))
const file = {
  path: '/fixtures/training.vce', version: 60, number: 'TRAIN', title: 'Training regression',
  passingScore: 700, timeLimit: 0, fileVersion: '1', style: '', description: '', sections: [],
  sizeBytes: 1, hasDecryptionWarnings: false,
  exams: [{ id: 1, type: 0, name: 'Exam A', sections: [], questions }]
}
const data = {
  examList: [{ id: 'training', title: file.title, filePath: file.path, trainingMode: false, addedAt: 0 }],
  options: {
    randomizeQuestions: false, randomizeChoices: false, enablePrevious: true, enableShowAnswer: true,
    enablePause: true, enableViewAnswers: true, enableCalculator: false, textSize: 'medium',
    colorScheme: 'default', showFilenameColumn: true, showExamAndQuestionNumber: true,
    disableClearHistory: false, disableEditExamList: false, disableExamMode: false,
    disableTimerChange: false, disableFileProperties: false, disablePrintReport: false,
    scanFolderOnStartup: false, scanFolder: '', resetCandidateName: false, defaultCandidateName: 'Training test',
    adminPasswordEnabled: false, adminPassword: '', requestPasswordToStartExam: false, requestPasswordToViewHistory: false
  },
  history: [], sessions: []
}
const handlers = {
  'app:getData': () => data,
  'exam:parse': () => ({ file }),
  'sessions:save': (_event, session) => { data.sessions = [session]; return data },
  'history:add': (_event, record) => { data.history.push(record); return data }
}
const errors = []
let win
let checks = 0
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`) }
const evaluate = (js) => win.webContents.executeJavaScript(js)
async function click(text) {
  assert.ok(await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${JSON.stringify(text)}).at(-1);
    if (!button || button.disabled) return false;
    button.click(); return true;
  })()`), `Enabled button: ${text}`)
  await sleep(80)
}
async function navigate(index) {
  await evaluate(`document.querySelectorAll('.nav-grid .cell')[${index}].click()`)
  await sleep(80)
}
async function save() {
  await click('Save Session')
  return data.sessions[0]
}

app.whenReady().then(async () => {
  try {
    for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler)
    win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: {
      preload: path.join(ROOT, 'out/preload/index.mjs'), contextIsolation: true, sandbox: false, nodeIntegration: false
    } })
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
    win.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message))
    await win.loadFile(path.join(ROOT, 'out/renderer/index.html'))
    await sleep(300)
    await click('Start Exam')
    check('training checkbox selected', await evaluate(`(() => {
      const label = [...document.querySelectorAll('.modal label')].find(l => l.textContent.includes('Training mode'));
      label.querySelector('input').click(); return true;
    })()`))
    await sleep(80)
    await click('Start Exam')
    check('training starts with correct answer visible', await evaluate(`document.querySelector('.question-main').textContent.includes('Correct answer:')`))
    check('training choice inputs are enabled', await evaluate(`[...document.querySelectorAll('.question-main input')].every(input => !input.disabled)`))
    await click('Hide Answer')
    check('answer can be hidden', !await evaluate(`document.querySelector('.question-main').textContent.includes('Correct answer:')`))
    await click('Show Answer')
    check('answer can be shown again', await evaluate(`document.querySelector('.question-main').textContent.includes('Correct answer:')`))

    // Deliberately wrong responses avoid auto-advance while testing every editor.
    for (let type = 0; type < questions.length; type++) {
      await navigate(type)
      check(`${names[type]} controls are writable`, await evaluate(`(() => {
        const controls = [...document.querySelectorAll('.question-main input, .question-main .hotarea, .question-main .dnd-item')];
        return controls.length > 0 && controls.every(c => !c.disabled && !c.readOnly);
      })()`))
      if (placement.has(type)) {
        await evaluate(`(() => {
          const item = document.querySelector('.dnd-pool button');
          if (item.getAttribute('aria-selected') !== 'true') item.click();
        })()`)
        await sleep(50)
        await evaluate(`document.querySelector('.slot').click()`)
      } else if ([3, 9].includes(type)) {
        await evaluate(`document.querySelector('.hotarea').click()`)
      } else if (type === 8) {
        await evaluate(`(() => {
          const input = document.querySelector('.question-main input[type=text]');
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'wrong');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        })()`)
      } else {
        await evaluate(`document.querySelector('.question-main input').click()`)
      }
      await sleep(80)
      const session = await save()
      const expected = placement.has(type) || [3, 9].includes(type) ? '1' : type === 8 ? 'wrong' : 'A'
      check(`${names[type]} answer stored`, session.options.trainingMode && session.states.find(s => s.questionId === type + 1).answer === expected)
      check(`${names[type]} feedback shown`, await evaluate(`document.querySelector('.answer-state-bad')?.textContent === 'Incorrect'`))
    }

    await navigate(0)
    await click('Reset')
    check('training reset clears response', (await save()).states[0].answer === '')
    await evaluate(`document.querySelectorAll('.question-main input')[1].click()`)
    await sleep(80)
    check('correct training feedback shown', await evaluate(`document.querySelector('.answer-state-ok')?.textContent === 'Correct'`))
    await sleep(400)
    check('correct response advances to next question', await evaluate(`document.querySelector('.q-index').textContent.startsWith('Question 2 of')`))
    check('correct training response saved', (await save()).states[0].answer === 'B')

    await click('End Exam')
    check('score record includes training responses', data.history[0]?.trainingMode && data.history[0].answers[0].given === 'B')
    await click('Review Answers')
    check('review answer controls remain read-only', await evaluate(`[...document.querySelectorAll('.question-main input')].every(c => c.disabled || c.readOnly)`))
    check('review reset is disabled', await evaluate(`[...document.querySelectorAll('.answer-bar button')].find(b => b.textContent.trim() === 'Reset').disabled`))
    check('no renderer/preload errors', errors.length === 0)
    console.log(`TRAINING SMOKE OK (${checks} checks)`)
    win.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    if (win && !win.isDestroyed()) win.destroy()
    app.exit(1)
  }
})
app.on('quit', () => fs.rmSync(profile, { recursive: true, force: true }))
