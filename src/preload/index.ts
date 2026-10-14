import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppData,
  AppOptions,
  ExamListEntry,
  HistoryRecord,
  ParseResult,
  SavedSession,
  VceFile
} from '@shared/types'

const api = {
  getData: (): Promise<AppData> => ipcRenderer.invoke('app:getData'),
  setOptions: (options: AppOptions): Promise<AppData> => ipcRenderer.invoke('app:setOptions', options),

  parseExam: (filePath: string, decryptKeysBase64?: string): Promise<ParseResult> =>
    ipcRenderer.invoke('exam:parse', filePath, decryptKeysBase64),
  openExamDialog: (): Promise<{ files: VceFile[]; errors: { path: string; message: string }[] }> =>
    ipcRenderer.invoke('exam:openDialog'),
  addToList: (entry: Partial<ExamListEntry> & { filePath: string }): Promise<AppData> =>
    ipcRenderer.invoke('exam:addToList', entry),
  updateInList: (entry: ExamListEntry): Promise<AppData> => ipcRenderer.invoke('exam:updateInList', entry),
  removeFromList: (id: string): Promise<AppData> => ipcRenderer.invoke('exam:removeFromList', id),
  scanFolder: (folder: string): Promise<{ added: number }> => ipcRenderer.invoke('exam:scanFolder', folder),

  addHistory: (record: HistoryRecord): Promise<AppData> => ipcRenderer.invoke('history:add', record),
  clearHistory: (): Promise<AppData> => ipcRenderer.invoke('history:clear'),

  saveSession: (session: SavedSession): Promise<AppData> => ipcRenderer.invoke('sessions:save', session),
  deleteSession: (id: string): Promise<AppData> => ipcRenderer.invoke('sessions:delete', id),
  clearSessions: (): Promise<AppData> => ipcRenderer.invoke('sessions:clear'),

  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  chooseFile: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:chooseFile', defaultPath),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  saveTextFile: (content: string, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('app:saveTextFile', content, defaultName),
  saveBinaryFile: (base64: string, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('app:saveBinaryFile', base64, defaultName),

  /** Called when a .vce is opened from the OS file association / command line. */
  onFileOpened: (callback: (result: ParseResult) => void): (() => void) => {
    const listener = (_event: unknown, result: ParseResult): void => callback(result)
    ipcRenderer.on('app:fileOpened', listener)
    ipcRenderer.send('app:rendererReady')
    return () => ipcRenderer.removeListener('app:fileOpened', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
