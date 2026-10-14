import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { readVceFile, VceParseError } from './vce/reader'
import * as db from './store'
import type {
  AppData,
  AppOptions,
  ExamLaunchOptions,
  ExamListEntry,
  HistoryRecord,
  ParseResult,
  SavedSession,
  VceFile
} from '@shared/types'

let mainWindow: BrowserWindow | null = null
let rendererReady = false
const pendingOpenPaths: string[] = []

function createWindow(): void {
  rendererReady = false
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 780,
    minHeight: 560,
    show: false,
    title: 'VCE Exam Player',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function findVceArg(argv: string[]): string | null {
  return argv.find((arg) => /\.vce$/i.test(arg) && !arg.startsWith('-')) ?? null
}

/** Opens a `.vce` passed on the command line / by the OS file association. */
async function openVceFromPath(filePath: string): Promise<void> {
  if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) {
    pendingOpenPaths.push(filePath)
    if (app.isReady() && (!mainWindow || mainWindow.isDestroyed())) createWindow()
    return
  }
  const result = await parseVcePath(filePath)
  // The renderer adds the parsed file to storage; do not add it twice here.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:fileOpened', result)
    mainWindow.show()
    mainWindow.focus()
  }
}

async function parseVcePath(filePath: string, decryptKeysBase64?: string): Promise<ParseResult> {
  try {
    const buffer = await readFile(filePath)
    const file = readVceFile(new Uint8Array(buffer), filePath, { decryptKeysBase64 })
    const info = await stat(filePath)
    file.sizeBytes = info.size
    file.created = info.birthtimeMs || undefined
    file.modified = info.mtimeMs || undefined
    return { file }
  } catch (error) {
    const message =
      error instanceof VceParseError ? error.message : (error as Error).message || 'Unknown error'
    return { error: { path: filePath, message } }
  }
}

function registerIpc(): void {
  // DOM load alone is too early: React must have installed its IPC listener.
  ipcMain.on('app:rendererReady', (event) => {
    if (event.sender !== mainWindow?.webContents) return
    rendererReady = true
    const paths = pendingOpenPaths.splice(0)
    void (async () => {
      for (const filePath of paths) await openVceFromPath(filePath)
    })()
  })
  ipcMain.handle('app:getData', (): AppData => db.getData())
  ipcMain.handle('app:setOptions', (_e, options: AppOptions): AppData => db.setOptions(options))

  ipcMain.handle('exam:parse', (_e, filePath: string, decryptKeysBase64?: string) =>
    parseVcePath(filePath, decryptKeysBase64)
  )

  ipcMain.handle(
    'exam:openDialog',
    async (): Promise<{ files: VceFile[]; errors: { path: string; message: string }[] }> => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Add Exam File',
        filters: [{ name: 'Visual CertExam File (*.vce)', extensions: ['vce'] }],
        properties: ['openFile', 'multiSelections']
      })
      const files: VceFile[] = []
      const errors: { path: string; message: string }[] = []
      for (const filePath of result.filePaths) {
        const parsed = await parseVcePath(filePath)
        if (parsed.file) files.push(parsed.file)
        else if (parsed.error) errors.push(parsed.error)
      }
      return { files, errors }
    }
  )

  ipcMain.handle('exam:addToList', (_e, entry: Partial<ExamListEntry> & { filePath: string }): AppData => {
    const parsed: ExamListEntry = {
      id: entry.id ?? randomUUID(),
      title: entry.title ?? '',
      filePath: entry.filePath,
      trainingMode: entry.trainingMode ?? false,
      addedAt: entry.addedAt ?? Date.now()
    }
    return db.addExam(parsed)
  })

  ipcMain.handle('exam:updateInList', (_e, entry: ExamListEntry): AppData => db.updateExam(entry))
  ipcMain.handle('exam:removeFromList', (_e, id: string): AppData => db.removeExam(id))

  ipcMain.handle('exam:scanFolder', async (_e, folder: string): Promise<{ added: number }> => {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(folder, { withFileTypes: true })
    let added = 0
    const list = db.getData().examList
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.vce')) continue
      const filePath = join(folder, entry.name)
      if (list.some((e) => e.filePath === filePath)) continue
      const parsed = await parseVcePath(filePath)
      if (parsed.file) {
        db.addExam({
          id: randomUUID(),
          title: parsed.file.title || parsed.file.number || entry.name,
          filePath,
          trainingMode: false,
          addedAt: Date.now()
        })
        added++
      }
    }
    return { added }
  })

  ipcMain.handle('history:add', (_e, record: HistoryRecord): AppData => db.addHistoryRecord(record))
  ipcMain.handle('history:clear', (): AppData => db.clearHistory())

  ipcMain.handle('sessions:save', (_e, session: SavedSession): AppData => db.saveSession(session))
  ipcMain.handle('sessions:delete', (_e, id: string): AppData => db.deleteSession(id))
  ipcMain.handle('sessions:clear', (): AppData => db.clearSessions())

  ipcMain.handle('dialog:openFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose folder',
      properties: ['openDirectory']
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('dialog:chooseFile', async (_e, defaultPath?: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose Exam File',
      filters: [{ name: 'Visual CertExam File (*.vce)', extensions: ['vce'] }],
      defaultPath,
      properties: ['openFile']
    })
    return result.filePaths[0] ?? null
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

  ipcMain.handle('app:saveTextFile', async (_e, content: string, defaultName: string): Promise<boolean> => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName })
    if (result.canceled || !result.filePath) return false
    const { writeFile } = await import('node:fs/promises')
    await writeFile(result.filePath, content, 'utf8')
    return true
  })

  ipcMain.handle(
    'app:saveBinaryFile',
    async (_e, base64: string, defaultName: string): Promise<boolean> => {
      const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: defaultName })
      if (result.canceled || !result.filePath) return false
      const { writeFile } = await import('node:fs/promises')
      await writeFile(result.filePath, Buffer.from(base64, 'base64'))
      return true
    }
  )
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const filePath = findVceArg(argv)
    if (filePath) void openVceFromPath(filePath)
    else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// macOS delivers files opened from Finder through this event.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  void openVceFromPath(filePath)
})

app.whenReady().then(() => {
  const argvPath = findVceArg(process.argv)
  if (argvPath && !pendingOpenPaths.includes(argvPath)) pendingOpenPaths.push(argvPath)
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

export type ExamLaunchOptionsExport = ExamLaunchOptions
