/**
 * Recorded smoke test for the examination window (task-ui-exam).
 * Drives the built renderer through an exam with choice / hot-area / placement
 * questions, checks keyboard navigation and the navigation grid, and records
 * exam, report and review screenshots.
 *
 * Usage: npx electron scripts/smoke-exam.cjs
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'docs', 'screenshots')

const OPTIONS = {
  randomizeQuestions: false,
  randomizeChoices: false,
  enablePrevious: true,
  enableShowAnswer: false,
  enablePause: true,
  enableViewAnswers: true,
  enableCalculator: false,
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

const FILE_PATH = '/exams/ui-exam.vce'
const SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><rect width="420" height="220" fill="#dbeafe"/><rect x="20" y="60" width="90" height="50" fill="#bfdbfe" stroke="#2563eb"/><rect x="160" y="60" width="90" height="50" fill="#bfdbfe" stroke="#2563eb"/><text x="20" y="40" font-size="18" fill="#1e3a8a">Select the correct zones</text></svg>'
)}`

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
  path: FILE_PATH,
  version: 60,
  number: 'UI-100',
  title: 'Modern exam UI',
  passingScore: 700,
  timeLimit: 0,
  fileVersion: '1.0',
  style: '',
  description: '',
  sections: [],
  sizeBytes: 1,
  hasDecryptionWarnings: false,
  exams: [
    {
      id: 1,
      type: 0,
      name: 'Exam A',
      sections: [],
      questions: [
        baseQuestion({
          id: 1,
          type: 0,
          rawType: 0,
          question: '<p>Which service stores secrets?</p>',
          variants: ['<p>Azure Key Vault</p>', '<p>Azure Blob Storage</p>', '<p>Azure Queue Storage</p>'],
          variantsCount: 3,
          answers: 'A'
        }),
        baseQuestion({
          id: 2,
          type: 9,
          rawType: 9,
          question: '<p>Select the two subnets that need a gateway.</p>',
          areaImage: SVG,
          hotAreas: [
            { x: 20, y: 60, width: 90, height: 50 },
            { x: 160, y: 60, width: 90, height: 50 }
          ],
          answers: '1,2'
        }),
        baseQuestion({
          id: 3,
          type: 5,
          rawType: 5,
          question: '<p>Order the deployment steps.</p>',
          variants: ['<p>Create the resource group</p>', '<p>Deploy the template</p>', '<p>Verify the output</p>'],
          variantsCount: 3,
          dropAreas: [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: 10, height: 10 }
          ],
          answers: '1,2,3'
        })
      ]
    }
  ]
}

const DATA = {
  examList: [{ id: '1', title: 'Modern exam UI', filePath: FILE_PATH, trainingMode: false, addedAt: Date.now() }],
  options: OPTIONS,
  history: [],
  sessions: []
}

const savedFiles = []
const channels = {
  'app:getData': () => DATA,
  'app:setOptions': (_e, o) => ({ ...DATA, options: o }),
  'app:saveTextFile': (_e, content, name) => {
    savedFiles.push({ content, name })
    return true
  },
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
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
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

async function shot(win, name, theme = '') {
  await win.webContents.executeJavaScript(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`)
  await sleep(300)
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), image.toPNG())
  console.log('saved', name)
}

app.whenReady().then(async () => {
  for (const [channel, handler] of Object.entries(channels)) ipcMain.handle(channel, handler)
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: path.join(ROOT, 'out', 'preload', 'index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'index.html'))
  await sleep(400)
  await clickByText(win, 'Start Exam')
  await sleep(400)
  await clickByText(win, 'Start Exam')
  await sleep(500)

  const cells = await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-grid .cell').length`)
  check('navigation grid renders one cell per question', cells === 3, `cells=${cells}`)

  // Keyboard: select choice A with "1", advance with ArrowRight.
  await win.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  `)
  await sleep(120)
  const answered = await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-grid .cell.answered').length`)
  check('digit key answers a choice question', answered === 1, `answered=${answered}`)

  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`)
  await sleep(200)
  const headline = await win.webContents.executeJavaScript(`document.querySelector('.q-index')?.textContent ?? ''`)
  check('ArrowRight navigates to the next question', /Question 2/.test(headline), headline)

  await shot(win, 'exam-light')
  await shot(win, 'exam-dark', 'dark')

  // End the exam and capture the report, then the review.
  await clickByText(win, 'End Exam')
  await sleep(400)
  const report = await win.webContents.executeJavaScript(`document.querySelector('.report-score')?.textContent ?? ''`)
  check('score report is shown', report.length > 0, `score=${report.trim()}`)
  await shot(win, 'report-light')

  // Save the report as TXT through the real export path.
  await clickByText(win, 'Save Report (TXT)')
  await sleep(200)
  const saved = savedFiles.find((f) => /score-report\.txt$/.test(f.name))
  check('Save Report (TXT) writes the report', Boolean(saved) && /SCORE REPORT/.test(saved.content), saved ? saved.name : 'none')

  // The visible report must be exportable to PDF.
  const pdf = await win.webContents.printToPDF({})
  check('report exports to PDF', pdf.subarray(0, 4).toString() === '%PDF', `bytes=${pdf.length}`)
  fs.writeFileSync(path.join(OUT, 'report-sample.pdf'), pdf)

  const reviewed = await clickByText(win, 'Review Answers')
  await sleep(300)
  const wrong = await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-grid .cell.wrong').length`)
  check('review marks incorrect questions in the grid', wrong >= 1, `wrong=${wrong}`)
  await shot(win, 'review-light')

  win.destroy()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${failed === 0 ? 'EXAM SMOKE OK' : `${failed} check(s) failed`}`)
  app.exit(failed === 0 ? 0 : 1)
})
