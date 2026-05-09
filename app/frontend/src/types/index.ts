export type TabType = 'terminal' | 'editor' | 'database' | 'preview' | 'problems' | 'config'

export interface ProbItem {
  file: string
  line: number
  col: number
  sev: number   // 0 = error · 1 = warn · 2 = info
  code: string
  msg: string
}

export interface Tab {
  id: string
  type: TabType
  title: string
  parentId?: string   // for editor/database/preview/problems tabs
  // editor-only
  filePath?: string
  content?: string
  language?: string
  gotoLine?: number   // navigate to this line when the editor mounts / value changes
  // terminal-only
  initialCwd?: string
  // database-only
  dbPath?: string
  // preview-only
  previewType?: 'markdown' | 'html' | 'url'
  previewSrc?: string
  previewPath?: string
  // problems-only
  problemsCwd?: string
  problemsSources?: string[]
  problemsItems?: ProbItem[]
}

export interface OpenDatabasePayload {
  path: string
  terminalId?: string
}

export interface OpenPreviewPayload {
  type: 'markdown' | 'html' | 'url'
  path?: string
  content?: string
  url?: string
  terminalId?: string
}

export interface OpenFilePayload {
  path: string
  content: string
  language: string
  terminalId?: string
  gotoLine?: number
}

export interface OpenProblemsPayload {
  cwd: string
  sources: string[]
  items: ProbItem[]
  terminalId?: string
}

export interface GitRecognitionConfig {
  show_git_branch: boolean
}

export interface AppConfig {
  default_directory: string
  indent_guides: boolean
  order_directory: boolean
  minimap: boolean
  theme: string
  show_timestamps: boolean
  git_recognition: GitRecognitionConfig
  soft_close: boolean
  zoom_insights: boolean
  minimal_pwd: boolean
  default_zoom: number
  custom_theme?: Record<string, string>
}
