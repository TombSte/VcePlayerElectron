/**
 * Domain types for the exam player.
 *
 * The `Vce*` types mirror the on-disk `.vce` structure (Visual CertExam).
 * The `Stored*` types are the app's own persisted state.
 */

export enum VceExamType {
  Question = 0,
  Section = 1
}

export enum VceSectionType {
  QuestionSet = 0,
  Testlet = 1
}

/**
 * Question types found in .vce files.
 *
 * Codes 0, 1, 2, 8 and 9 are verified against real files and the reference
 * C# reader (`ExamQuestionType`). The original VCE Player additionally ships
 * "Point and Shoot", "Create a Tree", "Build List and Reorder" and
 * "Drop and Connect" (see the shipped help); the `libcryptvce`/player enum
 * leaves exactly the 3..7 gap for them, so they are mapped here and parsed with
 * the matching record layout. Anything else is kept as `Unknown`.
 */
export enum VceQuestionType {
  SingleChoice = 0,
  MultipleChoice = 1,
  /** "Select and Place" (drag objects onto a graphic). */
  DragAndDrop = 2,
  /** "Point and Shoot" (place a target marker on a graphic). */
  PointAndShoot = 3,
  /** "Create a Tree" (place items on tree nodes). */
  CreateATree = 4,
  /** "Build List and Reorder" (order a list of items). */
  BuildListAndReorder = 5,
  /** "Drop and Connect" (connect source items to targets). */
  DropAndConnect = 6,
  /** "Multiple Choice Case Study" (multi-answer with a scenario). */
  CaseStudy = 7,
  FillInTheBlank = 8,
  HotArea = 9,
  Unknown = 255
}

export const VCE_QUESTION_TYPE_NAMES: Record<number, string> = {
  [VceQuestionType.SingleChoice]: 'Multiple Choice (single)',
  [VceQuestionType.MultipleChoice]: 'Multiple Choice',
  [VceQuestionType.DragAndDrop]: 'Select and Place',
  [VceQuestionType.PointAndShoot]: 'Point and Shoot',
  [VceQuestionType.CreateATree]: 'Create a Tree',
  [VceQuestionType.BuildListAndReorder]: 'Build List and Reorder',
  [VceQuestionType.DropAndConnect]: 'Drop and Connect',
  [VceQuestionType.CaseStudy]: 'Multiple Choice Case Study',
  [VceQuestionType.FillInTheBlank]: 'Fill in the Blank',
  [VceQuestionType.HotArea]: 'Hot Area'
}

/** True for the question families that place items into ordered slots. */
export function isPlacementType(type: VceQuestionType): boolean {
  return (
    type === VceQuestionType.DragAndDrop ||
    type === VceQuestionType.PointAndShoot ||
    type === VceQuestionType.CreateATree ||
    type === VceQuestionType.BuildListAndReorder ||
    type === VceQuestionType.DropAndConnect
  )
}

export interface HotArea {
  x: number
  y: number
  width: number
  height: number
}

export interface DragDropArea {
  x: number
  y: number
  width: number
  height: number
  /** For drag areas that are cropped from the source image (base64 <img> or empty). */
  text?: string
}

export interface VceQuestion {
  id: number
  /** Id of the enclosing testlet / question set, or -1 for top-level questions. */
  examSectionId: number
  type: VceQuestionType
  rawType: number
  sectionId: number
  complexity: number
  question: string
  reference: string
  variants: string[]
  variantsCount: number
  /** Correct answer: choice letters (A, B, ...), comma separated hot area indexes, etc. */
  answers: string
  areaImage?: string
  hotAreas: HotArea[]
  dndTypes: number[]
  dragAreas: DragDropArea[]
  dropAreas: DragDropArea[]
  blockAnswers: string[]
  blockAnswersCount: number
  /** Set when the raw bytes could not be parsed with confidence. */
  parseError?: string
  /** Decryption validation flag; false means the bytes looked garbled. */
  trusted: boolean
}

export interface VceExamSection {
  id: number
  type: VceSectionType
  timeLimit: number
  title?: string
  description?: string
}

export interface VceExam {
  id: number
  type: VceExamType
  name: string
  questions: VceQuestion[]
  sections: VceExamSection[]
}

export interface VceSection {
  id: number
  name: string
}

export interface VceFile {
  path: string
  version: number
  number: string
  title: string
  passingScore: number
  timeLimit: number
  fileVersion: string
  style: string
  description: string
  sections: VceSection[]
  exams: VceExam[]
  sizeBytes: number
  created?: number
  modified?: number
  /** True when at least one field could not be decrypted with the in-file keys. */
  hasDecryptionWarnings: boolean
}

export interface ParseError {
  path: string
  message: string
}

export interface ParseResult {
  file?: VceFile
  error?: ParseError
}

/** Persisted exam list entry. */
export interface ExamListEntry {
  id: string
  title: string
  filePath: string
  trainingMode: boolean
  addedAt: number
}

export type ExamModeKind =
  | 'all'
  | 'sections'
  | 'count'
  | 'range'
  | 'incorrect'

export interface ExamLaunchOptions {
  candidateName: string
  mode: ExamModeKind
  sectionIds: number[]
  questionCount: number
  rangeFrom: number
  rangeTo: number
  incorrectAtLeast: number
  trainingMode: boolean
  timerOn: boolean
  timeLimitMinutes: number
  randomizeQuestions: boolean
  randomizeChoices: boolean
  allowPrevious: boolean
  enableCalculator: boolean
  enablePause: boolean
}

export interface SessionQuestionState {
  questionId: number
  answer: string
  marked: boolean
  complete: boolean
  timeSpentSec: number
}

export interface SavedSession {
  id: string
  examPath: string
  examTitle: string
  examName: string
  candidateName: string
  startedAt: number
  updatedAt: number
  remainingSec: number | null
  options: ExamLaunchOptions
  questionOrder: number[]
  states: SessionQuestionState[]
}

export interface HistoryRecord {
  id: string
  examPath: string
  examTitle: string
  examName: string
  candidateName: string
  examDatetime: number
  elapsedSec: number
  passingScore: number
  candidateScore: number
  passed: boolean
  total: number
  correct: number
  incorrect: number
  incomplete: number
  marked: number
  trainingMode: boolean
  sections: { name: string; correct: number; total: number }[]
  answers: { questionId: number; given: string; correct: string; isCorrect: boolean; complete: boolean }[]
}

export interface AppOptions {
  randomizeQuestions: boolean
  randomizeChoices: boolean
  enablePrevious: boolean
  enableShowAnswer: boolean
  enablePause: boolean
  enableViewAnswers: boolean
  enableCalculator: boolean
  textSize: 'small' | 'medium' | 'large' | 'xlarge'
  colorScheme: 'default' | 'dark' | 'high-contrast'
  showFilenameColumn: boolean
  showExamAndQuestionNumber: boolean
  disableClearHistory: boolean
  disableEditExamList: boolean
  disableExamMode: boolean
  disableTimerChange: boolean
  disableFileProperties: boolean
  disablePrintReport: boolean
  scanFolderOnStartup: boolean
  scanFolder: string
  resetCandidateName: boolean
  defaultCandidateName: string
  adminPasswordEnabled: boolean
  adminPassword: string
  requestPasswordToStartExam: boolean
  requestPasswordToViewHistory: boolean
}

export interface ScoreHistoryData {
  records: HistoryRecord[]
  sessions: SavedSession[]
}

export interface AppData {
  examList: ExamListEntry[]
  options: AppOptions
  history: HistoryRecord[]
  sessions: SavedSession[]
}

export const DEFAULT_OPTIONS: AppOptions = {
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
