export type TabType = 'terminal' | 'editor'

export interface Tab {
  id: string
  type: TabType
  title: string
  parentId?: string   // for editor tabs: which terminal opened them
  // editor-only
  filePath?: string
  content?: string
  language?: string
  // terminal-only
  initialCwd?: string // cwd to restore on mount (soft-close)
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
}
