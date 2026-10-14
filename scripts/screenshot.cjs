/**
 * Captures UI screenshots from the built renderer for design review.
 * Usage: npx electron scripts/screenshot.cjs
 * Output: docs/screenshots/*.png
 */
const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
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
  enableViewAnswers: false,
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
  defaultCandidateName: '',
  adminPasswordEnabled: false,
  adminPassword: '',
  requestPasswordToStartExam: false,
  requestPasswordToViewHistory: false
}

const now = Date.now()
const DATA = {
  examList: [
    { id: '1', title: 'Microsoft AZ-104 — Azure Administrator', filePath: '/exams/microsoft.az-104.vce', trainingMode: false, addedAt: now },
    { id: '2', title: 'Microsoft AZ-900 — Azure Fundamentals', filePath: '/exams/microsoft.az-900.vce', trainingMode: false, addedAt: now },
    { id: '3', title: 'Cisco 300-410 — ENARSI', filePath: '/exams/cisco.300-410.vce', trainingMode: true, addedAt: now }
  ],
  options: OPTIONS,
  history: [
    { id: 'h1', examPath: '/exams/az-104.vce', examTitle: 'AZ-104', examName: 'Exam A', candidateName: 'Jane Doe', examDatetime: now - 86400000, elapsedSec: 2410, passingScore: 700, candidateScore: 812, passed: true, total: 50, correct: 41, sectionResults: [] },
    { id: 'h2', examPath: '/exams/az-900.vce', examTitle: 'AZ-900', examName: 'Exam A', candidateName: 'Jane Doe', examDatetime: now - 172800000, elapsedSec: 1900, passingScore: 700, candidateScore: 640, passed: false, total: 40, correct: 26, sectionResults: [] }
  ],
  sessions: [
    { id: 's1', filePath: '/exams/az-104.vce', examIndex: 0, examTitle: 'AZ-104', candidateName: 'Jane Doe', savedAt: now, options: {}, answers: {}, flagged: [], elapsedSec: 1200, currentIndex: 3 }
  ]
}

const channels = {
  'app:getData': () => DATA,
  'app:setOptions': (_e, o) => ({ ...DATA, options: o }),
  'app:saveTextFile': () => true,
  'app:saveBinaryFile': () => true,
  'exam:parse': () => ({ file: null, error: { message: 'screenshot mode' } }),
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

const SHOTS = [
  { name: 'main-light', theme: '', click: null },
  { name: 'main-dark', theme: 'dark', click: null },
  { name: 'main-high-contrast', theme: 'high-contrast', click: null },
  { name: 'options-dialog-light', theme: '', click: 'Options' },
  { name: 'options-dialog-dark', theme: 'dark', click: 'Options' },
  { name: 'history-light', theme: '', click: 'History' },
  { name: 'history-dark', theme: 'dark', click: 'History' }
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  for (const [channel, handler] of Object.entries(channels)) ipcMain.handle(channel, handler)
  fs.mkdirSync(OUT, { recursive: true })

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: '#eef1f6',
    webPreferences: {
      preload: path.join(ROOT, 'out', 'preload', 'index.mjs'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  const load = () => new Promise((resolve) => win.webContents.once('did-finish-load', resolve))

  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'index.html'))

  for (const shot of SHOTS) {
    await win.webContents.reload()
    await load()
    await sleep(200)
    await win.webContents.executeJavaScript(
      `document.documentElement.dataset.theme = ${JSON.stringify(shot.theme)};`
    )
    if (shot.click) {
      await win.webContents.executeJavaScript(`
        [...document.querySelectorAll('button')]
          .find((b) => b.textContent.trim() === ${JSON.stringify(shot.click)})?.click();
      `)
    }
    await sleep(450)
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(OUT, `${shot.name}.png`), image.toPNG())
    console.log('saved', shot.name)
  }

  win.destroy()
  app.exit(0)
})
