import React, { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import TabBar from './components/TabBar'
import Terminal from './components/Terminal'
import Editor from './components/Editor'
import Database from './components/Database'
import Preview from './components/Preview'
import Problems from './components/Problems'
import ConfigEditor from './components/ConfigEditor'
import ZoomIndicator from './components/ZoomIndicator'
import { Tab, ProbItem, OpenFilePayload, OpenDatabasePayload, OpenPreviewPayload, OpenProblemsPayload, AppConfig } from './types'
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
import { GetAppConfig, SaveSession, LoadSession, ReadFile, GetFileLanguage, GetTerminalCwd, ScanProblems, SaveCustomTheme, SaveAppConfig } from '../wailsjs/go/main/App'
import { Quit } from '../wailsjs/runtime/runtime'
import { getTheme, customColorsToTheme } from './themes'
import './App.css'

let tabCounter = 0
const nextId = () => `tab-${++tabCounter}`

function makeTerminalTab(id?: string, initialCwd?: string, parentId?: string): Tab {
  return {
    id: id ?? nextId(),
    type: 'terminal',
    title: 'terminal',
    ...(initialCwd ? { initialCwd } : {}),
    ...(parentId   ? { parentId }   : {}),
  }
}

type TabState = { tabs: Tab[]; activeId: string }
type TabAction =
  | { type: 'add-terminal';    id?: string; initialCwd?: string; parentId?: string; keepActive?: boolean }
  | { type: 'open-file';       payload: OpenFilePayload }
  | { type: 'open-database';   payload: OpenDatabasePayload }
  | { type: 'open-preview';    payload: OpenPreviewPayload }
  | { type: 'open-problems';   payload: OpenProblemsPayload }
  | { type: 'open-config';     terminalId?: string }
  | { type: 'update-problems'; id: string; sources: string[]; items: ProbItem[]; scanning?: boolean }
  | { type: 'close';           id: string }
  | { type: 'select';          id: string }
  | { type: 'restore-session'; tabs: Tab[] }

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {

    case 'add-terminal': {
      const tab = makeTerminalTab(action.id, action.initialCwd, action.parentId)
      const newTabs = [...state.tabs]
      // If sibling terminal, insert right after the parent group
      if (action.parentId) {
        let insertIdx = newTabs.length
        for (let i = newTabs.length - 1; i >= 0; i--) {
          if (newTabs[i].id === action.parentId || newTabs[i].parentId === action.parentId) {
            insertIdx = i + 1
            break
          }
        }
        newTabs.splice(insertIdx, 0, tab)
      } else {
        newTabs.push(tab)
      }
      return {
        tabs: newTabs,
        activeId: action.keepActive ? state.activeId : tab.id,
      }
    }

    case 'open-file': {
      const { payload } = action
      const existing = state.tabs.find(t => t.type === 'editor' && t.filePath === payload.path)
      if (existing) {
        // Navigate to the requested line if provided; keep the tab active.
        return {
          ...state, activeId: existing.id,
          tabs: payload.gotoLine
            ? state.tabs.map(t => t.id === existing.id ? { ...t, gotoLine: payload.gotoLine } : t)
            : state.tabs,
        }
      }

      const fileName = payload.path.replace(/\\/g, '/').split('/').pop() ?? payload.path
      const tab: Tab = {
        id: nextId(), type: 'editor', title: fileName,
        filePath: payload.path, content: payload.content,
        language: payload.language, parentId: payload.terminalId,
        gotoLine: payload.gotoLine,
      }
      return insertNearParent(state, tab, payload.terminalId)
    }

    case 'open-database': {
      const { payload } = action
      const existing = state.tabs.find(t => t.type === 'database' && t.dbPath === payload.path)
      if (existing) return { ...state, activeId: existing.id }

      const fileName = payload.path.replace(/\\/g, '/').split('/').pop() ?? payload.path
      const tab: Tab = {
        id: nextId(), type: 'database', title: fileName,
        dbPath: payload.path, parentId: payload.terminalId,
      }
      return insertNearParent(state, tab, payload.terminalId)
    }

    case 'open-preview': {
      const { payload } = action
      const previewKey = payload.type === 'url' ? payload.url! : payload.path!
      const existing = state.tabs.find(t => t.type === 'preview' && t.previewPath === previewKey)
      if (existing) return { ...state, activeId: existing.id }

      const title = previewKey.replace(/\\/g, '/').split('/').pop() ?? previewKey
      const tab: Tab = {
        id: nextId(), type: 'preview', title,
        previewType: payload.type,
        previewSrc: payload.type === 'url' ? payload.url! : payload.content!,
        previewPath: previewKey,
        parentId: payload.terminalId,
      }
      return insertNearParent(state, tab, payload.terminalId)
    }

    case 'open-problems': {
      const { payload } = action
      // Re-use an existing problems tab for the same directory.
      const existing = state.tabs.find(t => t.type === 'problems' && t.problemsCwd === payload.cwd)
      if (existing) {
        return {
          ...state, activeId: existing.id,
          tabs: state.tabs.map(t => t.id === existing.id
            ? { ...t, problemsSources: payload.sources, problemsItems: payload.items }
            : t),
        }
      }
      const tab: Tab = {
        id: nextId(), type: 'problems', title: 'problems',
        parentId: payload.terminalId,
        problemsCwd: payload.cwd,
        problemsSources: payload.sources,
        problemsItems: payload.items,
      }
      return insertNearParent(state, tab, payload.terminalId)
    }

    case 'open-config': {
      const existing = state.tabs.find(t => t.type === 'config')
      if (existing) return { ...state, activeId: existing.id }
      const tab: Tab = {
        id: nextId(), type: 'config', title: 'Settings',
        parentId: action.terminalId,
      }
      return insertNearParent(state, tab, action.terminalId)
    }

    case 'update-problems': {
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === action.id
          ? { ...t, problemsSources: action.sources, problemsItems: action.items }
          : t),
      }
    }

    case 'close': {
      if (state.tabs.length <= 1) return state
      const idx = state.tabs.findIndex(t => t.id === action.id)
      const newTabs = state.tabs.filter(t => t.id !== action.id)
      const newActiveId = state.activeId === action.id
        ? newTabs[Math.min(idx, newTabs.length - 1)].id
        : state.activeId
      return { tabs: newTabs, activeId: newActiveId }
    }

    case 'select':
      return { ...state, activeId: action.id }

    case 'restore-session':
      if (action.tabs.length === 0) return state
      return { tabs: action.tabs, activeId: action.tabs[action.tabs.length - 1].id }

    default:
      return state
  }
}

function insertNearParent(state: TabState, tab: Tab, terminalId?: string): TabState {
  const newTabs = [...state.tabs]
  if (terminalId) {
    let insertIdx = newTabs.length
    for (let i = newTabs.length - 1; i >= 0; i--) {
      if (newTabs[i].id === terminalId || newTabs[i].parentId === terminalId) {
        insertIdx = i + 1
        break
      }
    }
    newTabs.splice(insertIdx, 0, tab)
  } else {
    newTabs.push(tab)
  }
  return { tabs: newTabs, activeId: tab.id }
}

// ── default config ────────────────────────────────────────────────────────────
const defaultConfig: AppConfig = {
  default_directory: '', indent_guides: false, order_directory: false,
  minimap: false, theme: 'dark', show_timestamps: false,
  git_recognition: { show_git_branch: false }, soft_close: false,
  zoom_insights: true, minimal_pwd: false, default_zoom: 1,
}

const initialTab = makeTerminalTab()
const initialState: TabState = { tabs: [initialTab], activeId: initialTab.id }

const DIVIDER_PX = 4

export default function App() {
  const [state, dispatch] = useReducer(tabReducer, initialState)
  const { tabs, activeId } = state

  const [appConfig, setAppConfig] = useState<AppConfig>(defaultConfig)
  // currentZoom is the single source of truth for terminal/editor font zoom.
  // It starts at default_zoom from config; the ZoomIndicator steps it up/down.
  const [currentZoom, setCurrentZoom] = useState(defaultConfig.default_zoom)

  // liveColors: set by the ThemeEditor for instant preview before saving.
  // null means "use config theme" (the normal path).
  const [liveColors, setLiveColors] = useState<Record<string, string> | null>(null)

  // resolvedTheme: the AppTheme actually used for CSS vars, xterm and Monaco.
  const resolvedTheme = useMemo(() => {
    if (liveColors) return customColorsToTheme(liveColors)
    if (appConfig.theme === 'custom' && appConfig.custom_theme && Object.keys(appConfig.custom_theme).length > 0) {
      return customColorsToTheme(appConfig.custom_theme)
    }
    return getTheme(appConfig.theme)
  }, [liveColors, appConfig.theme, appConfig.custom_theme])

  // ── split state ─────────────────────────────────────────────────────────────
  const [splitEnabled,  setSplitEnabled]  = useState(false)
  const [secondaryId,   setSecondaryId]   = useState<string>('')
  const [focusedPane,   setFocusedPane]   = useState<'primary' | 'secondary'>('primary')
  const [splitRatio,    setSplitRatio]    = useState(0.5)
  const contentRef  = useRef<HTMLDivElement>(null)
  const dragging    = useRef(false)

  // When a closed tab was the secondary, clear secondaryId
  useEffect(() => {
    if (secondaryId && !tabs.find(t => t.id === secondaryId)) {
      setSecondaryId('')
      setSplitEnabled(false)
    }
  }, [tabs, secondaryId])

  // ── config ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    GetAppConfig().then(cfg => {
      setAppConfig(cfg as AppConfig)
      setCurrentZoom((cfg as AppConfig).default_zoom)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    EventsOn('app:config', (cfg: AppConfig) => {
      setAppConfig(cfg)
      setCurrentZoom(cfg.default_zoom)
      setLiveColors(null) // discard in-progress preview; config is now the source
    })
    return () => EventsOff('app:config')
  }, [])

  // ── session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!appConfig.soft_close) return
    LoadSession().then(async (sessionTabs) => {
      if (!sessionTabs || sessionTabs.length === 0) return
      const restoredTabs: Tab[] = []
      let lastTerminalId: string | undefined

      for (const st of sessionTabs) {
        if (st.type === 'terminal') {
          const tab = makeTerminalTab(undefined, st.cwd || undefined)
          lastTerminalId = tab.id
          restoredTabs.push(tab)
        } else if (st.type === 'editor' && st.file_path) {
          try {
            const content = await ReadFile(st.file_path)
            const fileName = st.file_path.replace(/\\/g, '/').split('/').pop() ?? st.file_path
            restoredTabs.push({
              id: nextId(), type: 'editor', title: fileName,
              filePath: st.file_path, content,
              language: st.language || 'plaintext', parentId: lastTerminalId,
            })
          } catch { /* file gone */ }
        }
      }
      if (restoredTabs.length > 0) dispatch({ type: 'restore-session', tabs: restoredTabs })
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appConfig.soft_close])

  // ── quit ────────────────────────────────────────────────────────────────────
  const handleQuit = async () => {
    if (appConfig.soft_close) {
      const sessionTabs = await Promise.all(tabs.map(async t => {
        if (t.type === 'terminal') {
          const cwd = await GetTerminalCwd(t.id).catch(() => '')
          return { type: t.type, file_path: '', language: '', cwd }
        }
        return { type: t.type, file_path: t.filePath ?? '', language: t.language ?? '', cwd: '' }
      }))
      await SaveSession(sessionTabs).catch(() => {})
    }
    Quit()
  }

  // ── theme ───────────────────────────────────────────────────────────────────
  // resolvedTheme is the single source of truth — applies to CSS vars,
  // xterm (via Terminal props) and Monaco (via Editor props).
  useEffect(() => {
    const t = resolvedTheme
    const root = document.documentElement
    root.style.setProperty('--app-bg',               t.appBg)
    root.style.setProperty('--border-color',          t.borderColor)
    root.style.setProperty('--info-bar-bg',           t.infoBarBg)
    root.style.setProperty('--info-bar-color',        t.infoBarColor)
    root.style.setProperty('--info-bar-hover-bg',     t.infoBarHoverBg)
    root.style.setProperty('--info-bar-hover-color',  t.infoBarHoverColor)
    root.style.setProperty('--tab-color',             t.tabColor)
    root.style.setProperty('--tab-color-hover',       t.tabColorHover)
    root.style.setProperty('--tab-add-border',        t.tabAddBorder)
  }, [resolvedTheme])

  // ── Go events ───────────────────────────────────────────────────────────────
  useEffect(() => {
    EventsOn('app:open-file', (...args: any[]) => {
      const payload = args[0] as OpenFilePayload
      if (!payload?.path || payload.content === undefined) return
      dispatch({ type: 'open-file', payload })
    })
    return () => EventsOff('app:open-file')
  }, [])

  useEffect(() => {
    EventsOn('app:open-database', (...args: any[]) => {
      const payload = args[0] as OpenDatabasePayload
      if (!payload?.path) return
      dispatch({ type: 'open-database', payload })
    })
    return () => EventsOff('app:open-database')
  }, [])

  useEffect(() => {
    EventsOn('app:open-preview', (...args: any[]) => {
      const payload = args[0] as OpenPreviewPayload
      if (!payload?.type) return
      dispatch({ type: 'open-preview', payload })
    })
    return () => EventsOff('app:open-preview')
  }, [])

  useEffect(() => {
    EventsOn('app:open-problems', (...args: any[]) => {
      const payload = args[0] as OpenProblemsPayload
      if (!payload?.cwd) return
      dispatch({ type: 'open-problems', payload })
    })
    return () => EventsOff('app:open-problems')
  }, [])

  useEffect(() => {
    EventsOn('app:open-config', (...args: any[]) => {
      const terminalId = (args[0] as any)?.terminalId as string | undefined
      dispatch({ type: 'open-config', terminalId })
    })
    return () => EventsOff('app:open-config')
  }, [])

  // ── split helpers ────────────────────────────────────────────────────────────

  const handleTabSelect = useCallback((id: string) => {
    if (!splitEnabled) {
      dispatch({ type: 'select', id })
      return
    }
    if (focusedPane === 'primary') {
      // Clicking the tab that's already in secondary → swap
      if (id === secondaryId) setSecondaryId(activeId)
      dispatch({ type: 'select', id })
    } else {
      // Secondary pane focused — clicking primary's tab → swap
      if (id === activeId) dispatch({ type: 'select', id: secondaryId })
      setSecondaryId(id)
    }
  }, [splitEnabled, focusedPane, activeId, secondaryId])

  const handleSplitToggle = useCallback(() => {
    if (splitEnabled) {
      setSplitEnabled(false)
      setFocusedPane('primary')
      return
    }
    // Pick a secondary tab: prefer any existing tab that isn't the primary
    const other = tabs.find(t => t.id !== activeId)
    if (other) {
      setSecondaryId(other.id)
      setSplitEnabled(true)
    } else {
      // No other tab — create a new terminal for the secondary pane
      const newTermId = nextId()
      dispatch({ type: 'add-terminal', id: newTermId, keepActive: true })
      setSecondaryId(newTermId)
      setSplitEnabled(true)
    }
  }, [splitEnabled, tabs, activeId])

  const handleAddSiblingTerminal = useCallback(async (parentId: string) => {
    const cwd = await GetTerminalCwd(parentId).catch(() => '')
    dispatch({ type: 'add-terminal', parentId, initialCwd: cwd || undefined })
  }, [])

  // ── theme helpers ────────────────────────────────────────────────────────────

  // Apply colors instantly for live preview (no persistence).
  const handleApplyColors = useCallback((colors: Record<string, string>) => {
    setLiveColors(colors)
  }, [])

  // Persist custom theme to config.json and set theme = "custom".
  // app:config event will fire → setLiveColors(null) → resolvedTheme recomputes.
  const handleSaveTheme = useCallback(async (colors: Record<string, string>) => {
    await SaveCustomTheme(colors)
  }, [])

  // Persist non-colour settings (theme name, toggles, zoom, dir…).
  // app:config event will fire → appConfig updates → ConfigEditor re-syncs.
  const handleSaveSettings = useCallback(async (cfg: AppConfig) => {
    await SaveAppConfig(cfg as any)
  }, [])

  // ── problems helpers ─────────────────────────────────────────────────────────

  const handleRescanProblems = useCallback(async (tabId: string, cwd: string) => {
    const result = await ScanProblems(cwd).catch(() => null)
    if (!result) return
    dispatch({ type: 'update-problems', id: tabId, sources: (result as any).sources ?? [], items: (result as any).items ?? [] })
  }, [])

  const handleOpenFileAtLine = useCallback(async (path: string, line: number, col: number) => {
    try {
      const content = await ReadFile(path)
      const lang    = await GetFileLanguage(path)
      dispatch({ type: 'open-file', payload: { path, content, language: lang, gotoLine: line } })
    } catch { /* file gone */ }
  }, [])

  // ── divider drag ─────────────────────────────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !contentRef.current) return
      const rect = contentRef.current.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  // ── render ───────────────────────────────────────────────────────────────────

  function renderTabContent(tab: Tab, inPrimary: boolean) {
    const isActive = inPrimary ? tab.id === activeId : tab.id === secondaryId
    if (tab.type === 'terminal') {
      return (
        <Terminal
          tabId={tab.id}
          active={isActive}
          xtermTheme={resolvedTheme.xtermTheme}
          initialCwd={tab.initialCwd}
          defaultZoom={currentZoom}
        />
      )
    }
    if (tab.type === 'editor') {
      return (
        <Editor
          tabId={tab.id}
          filePath={tab.filePath!}
          content={tab.content ?? ''}
          language={tab.language ?? 'plaintext'}
          active={isActive}
          indentGuides={appConfig.indent_guides}
          monacoTheme={resolvedTheme.monacoThemeId}
          monacoThemeDef={resolvedTheme.monacoThemeDef as any}
          minimap={appConfig.minimap}
          defaultZoom={currentZoom}
          gotoLine={tab.gotoLine}
        />
      )
    }
    if (tab.type === 'database') return <Database dbPath={tab.dbPath!} />
    if (tab.type === 'problems') {
      return (
        <Problems
          tabId={tab.id}
          cwd={tab.problemsCwd!}
          sources={tab.problemsSources ?? []}
          items={tab.problemsItems ?? []}
          scanning={false}
          onRescan={handleRescanProblems}
          onOpenFile={handleOpenFileAtLine}
        />
      )
    }
    if (tab.type === 'preview') {
      return (
        <Preview
          previewType={tab.previewType!}
          src={tab.previewSrc!}
          path={tab.previewPath!}
        />
      )
    }
    if (tab.type === 'config') {
      return (
        <ConfigEditor
          appConfig={appConfig}
          onSaveSettings={handleSaveSettings}
          onApply={handleApplyColors}
          onSaveTheme={handleSaveTheme}
        />
      )
    }
    return null
  }

  return (
    <div className="app">
      <TabBar
        tabs={tabs}
        activeId={activeId}
        secondaryId={secondaryId}
        splitEnabled={splitEnabled}
        focusedPane={focusedPane}
        onSelect={handleTabSelect}
        onClose={id => dispatch({ type: 'close', id })}
        onNewTerminal={() => dispatch({ type: 'add-terminal' })}
        onSplitToggle={handleSplitToggle}
        onAddSiblingTerminal={handleAddSiblingTerminal}
        onQuit={handleQuit}
      />

      <ZoomIndicator enabled={appConfig.zoom_insights} defaultZoom={appConfig.default_zoom} onZoomChange={setCurrentZoom} />

      <div className="app__content" ref={contentRef}>
        {tabs.map(tab => {
          const isPrimary   = tab.id === activeId
          const isSecondary = splitEnabled && tab.id === secondaryId

          // Pane position/visibility
          let style: React.CSSProperties

          if (!isPrimary && !isSecondary) {
            style = { display: 'none', left: 0, right: 0 }
          } else if (!splitEnabled) {
            style = { display: 'flex', left: 0, right: 0 }
          } else if (isPrimary) {
            style = {
              display: 'flex',
              left: 0,
              width: `calc(${splitRatio * 100}% - ${DIVIDER_PX / 2}px)`,
            }
          } else {
            style = {
              display: 'flex',
              left: `calc(${splitRatio * 100}% + ${DIVIDER_PX / 2}px)`,
              right: 0,
            }
          }

          const focusClass = splitEnabled
            ? isPrimary && focusedPane === 'primary'   ? ' app__pane--focused'
            : isSecondary && focusedPane === 'secondary' ? ' app__pane--focused'
            : ''
            : ''

          return (
            <div
              key={tab.id}
              className={`app__pane${focusClass}`}
              style={style}
              onMouseDown={() => {
                if (!splitEnabled) return
                setFocusedPane(isPrimary ? 'primary' : 'secondary')
              }}
            >
              {renderTabContent(tab, isPrimary)}
            </div>
          )
        })}

        {/* Draggable split divider */}
        {splitEnabled && (
          <div
            className="app__divider"
            style={{ left: `calc(${splitRatio * 100}% - ${DIVIDER_PX / 2}px)` }}
            onMouseDown={handleDividerMouseDown}
          />
        )}
      </div>
    </div>
  )
}
