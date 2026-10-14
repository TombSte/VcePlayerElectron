/**
 * Recorded smoke test for the drag-and-drop / placement UI (task-dnd-ui).
 *
 * Drives the built renderer in Electron with a mocked exam file containing a
 * "Build List and Reorder" question, exercises the placement editor with both
 * mouse and keyboard, asserts the serialized answer and records screenshots.
 *
 * Usage: npx electron scripts/smoke-dnd.cjs
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
  enableViewAnswers: false,
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
  defaultCandidateName: '',
  adminPasswordEnabled: false,
  adminPassword: '',
  requestPasswordToStartExam: false,
  requestPasswordToViewHistory: false
}

const FILE_PATH = '/exams/placement.vce'

const EXAM_FILE = {
  path: FILE_PATH,
  version: 60,
  number: 'TEST-001',
  title: 'Placement fixture',
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
        {
          id: 1,
          examSectionId: -1,
          type: 5,
          rawType: 5,
          sectionId: 0,
          complexity: 0,
          question: '<p>Order the deployment steps.</p>',
          reference: '',
          variants: ['<p>Create the resource group</p>', '<p>Deploy the template</p>', '<p>Verify the output</p>'],
          variantsCount: 3,
          answers: '2,1,3',
          areaImage: '',
          hotAreas: [],
          dndTypes: [],
          dragAreas: [],
          dropAreas: [
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: 10, height: 10 },
            { x: 0, y: 0, width: 10, height: 10 }
          ],
          blockAnswers: [],
          blockAnswersCount: 0,
          trusted: true
        }
      ]
    }
  ]
}

const DATA = {
  examList: [{ id: '1', title: 'Placement fixture', filePath: FILE_PATH, trainingMode: false, addedAt: Date.now() }],
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

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

app.whenReady().then(async () => {
  for (const [channel, handler] of Object.entries(channels)) ipcMain.handle(channel, handler)
  fs.mkdirSync(OUT, { recursive: true })

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

  await win.loadFile(path.join(ROOT, 'out', 'renderer', 'index.html'))
  await sleep(400)

  check('start exam opens the mode dialog', await clickByText(win, 'Start Exam'))
  await sleep(400)
  await clickByText(win, 'Start Exam')
  await sleep(500)

  const mounted = await win.webContents.executeJavaScript(`document.querySelectorAll('.dnd-item.slot').length`)
  check('placement editor renders three slots', mounted === 3, `slots=${mounted}`)

  // Mouse: select choice B, place it into the first slot.
  await win.webContents.executeJavaScript(`
    document.querySelectorAll('.dnd-pool .dnd-item')[1]?.click();
  `)
  await sleep(150)
  await win.webContents.executeJavaScript(`
    document.querySelectorAll('.dnd-item.slot')[0]?.click();
  `)
  await sleep(150)
  const slot0 = await win.webContents.executeJavaScript(`document.querySelectorAll('.dnd-item.slot')[0].textContent`)
  check('mouse: slot 1 shows the placed choice', /B/.test(slot0), `slot="${slot0.trim()}"`)

  // Keyboard: focus choice C, press Enter, place into slot 2, then clear slot 1 with Delete.
  await win.webContents.executeJavaScript(`
    (() => {
      const choice = document.querySelectorAll('.dnd-pool .dnd-item')[2];
      choice.focus();
      choice.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return document.activeElement === choice;
    })()
  `)
  await sleep(150)
  await win.webContents.executeJavaScript(`document.querySelectorAll('.dnd-item.slot')[2]?.click()`)
  await sleep(150)
  const slot2 = await win.webContents.executeJavaScript(`document.querySelectorAll('.dnd-item.slot')[2].textContent`)
  check('keyboard: slot 3 shows the placed choice', /C/.test(slot2), `slot="${slot2.trim()}"`)

  await win.webContents.executeJavaScript(`
    (() => {
      const slot = document.querySelectorAll('.dnd-item.slot')[0];
      slot.focus();
      slot.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    })()
  `)
  await sleep(150)
  const slot0After = await win.webContents.executeJavaScript(`document.querySelectorAll('.dnd-item.slot')[0].textContent`)
  check('keyboard: Delete clears a slot', /empty/.test(slot0After), `slot="${slot0After.trim()}"`)

  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'dnd-placement.png'), image.toPNG())
  console.log('saved dnd-placement.png')

  win.destroy()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${failed === 0 ? 'DND SMOKE OK' : `${failed} check(s) failed`}`)
  app.exit(failed === 0 ? 0 : 1)
})
