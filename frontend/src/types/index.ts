export type TabType = 'terminal' | 'editor' | 'database' | 'preview'

export interface Tab {
  id: string
  type: TabType
  title: string
  parentId?: string   // for editor/database/preview tabs: which terminal opened them
  // editor-only
  filePath?: string
  content?: string
  language?: string
  // terminal-only
  initialCwd?: string // cwd to restore on mount (soft-close)
  // database-only
  dbPath?: string
  // preview-only
  previewType?: 'markdown' | 'html' | 'url'
  previewSrc?: string   // file content (md/html) or URL
  previewPath?: string  // file path or URL (used for dedup + display)
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
}
