import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import type { ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'
import {
  CreateTerminal,
  ExecuteCommand,
  InterruptCommand,
  CloseTerminal,
  GetClipboardText,
  GetTerminalCwd,
  SetTerminalCwd,
  SelectDirectory,
  GetCompletions,
  CtrlClickPath,
} from '../../wailsjs/go/main/App'
import '@xterm/xterm/css/xterm.css'

interface Props {
  tabId: string
  active: boolean
  xtermTheme: ITheme
  initialCwd?: string
}

// Completion dropdown state (React state for rendering)
interface MenuState {
  matches: string[]
  descriptions?: string[]  // optional right-side labels (slash commands)
  selectedIdx: number
  applied: boolean         // true after first Tab press
  appliedLen: number       // chars currently in terminal for this token
  originalPartial: string  // what user typed before any Tab
  prefix: string           // line up to (not including) the completion token
  top: number              // fixed px position
  left: number
}

// App-specific slash commands shown in the autocomplete dropdown.
// Standard terminal commands (cd, ls, clear, etc.) do not need a slash.
const SLASH_COMMANDS: { cmd: string; desc: string }[] = [
  { cmd: '/config',          desc: 'open config.json' },
  { cmd: '/config --reload', desc: 'reload config' },
  { cmd: '/help',            desc: 'show help' },
  { cmd: '/themes',          desc: 'list available themes' },
]

function abbreviatePath(path: string): string {
  return path.replace(/\\/g, '/')
}

export default function Terminal({ tabId, active, xtermTheme, initialCwd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  const xtermThemeRef = useRef(xtermTheme)
  useEffect(() => { xtermThemeRef.current = xtermTheme }, [xtermTheme])
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = xtermTheme
  }, [xtermTheme])

  const [cwd, setCwd] = useState('')
  const [fontSize, setFontSize] = useState(13)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<MenuState | null>(null)
  useEffect(() => { menuRef.current = menu }, [menu])

  // Refs so JSX handlers can call functions defined inside the main useEffect
  const applyMatchRef = useRef<((match: string) => void) | null>(null)

  useEffect(() => {
    GetTerminalCwd(tabId).then(p => { if (p) setCwd(p) }).catch(() => {})
  }, [tabId])

  useEffect(() => {
    const event = `terminal:cwd:${tabId}`
    EventsOn(event, (path: string) => setCwd(path))
    return () => EventsOff(event)
  }, [tabId])

  const handleCwdClick = async () => {
    const path = await SelectDirectory().catch(() => '')
    if (path) SetTerminalCwd(tabId, path)
  }

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current

    const term = new XTerm({
      theme: xtermThemeRef.current,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
      fontSize,
      lineHeight: 1.45,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
      scrollback: 5000,
      convertEol: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    fitAddon.fit()
    termRef.current = term
    fitRef.current = fitAddon

    // ── Ctrl+Click: open files / cd into directories ─────────────────────────
    // Direct mouse-event approach — more reliable than registerLinkProvider in
    // the WebView2 host.  When Ctrl is held:
    //   • cursor turns into a pointer over the terminal canvas
    //   • clicking resolves the word under the cursor as a path relative to cwd
    //   • directories  → cd (SetCwd + new prompt)
    //   • files        → open in editor tab

    const isPathChar = (c: string) => /[a-zA-Z0-9_./\\-]/.test(c)

    // Set the cursor on the xterm canvas/row elements so the user sees a pointer
    // while Ctrl is held, indicating that clicking is available.
    const setCtrlCursor = (pointer: boolean) => {
      container.querySelectorAll<HTMLElement>('canvas, .xterm-rows').forEach(el => {
        el.style.cursor = pointer ? 'pointer' : ''
      })
    }

    const handleCtrlMouseMove = (e: MouseEvent) => setCtrlCursor(e.ctrlKey)
    const handleCtrlKeyDown   = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlCursor(true)  }
    const handleCtrlKeyUp     = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlCursor(false) }

    const handleCtrlClick = (e: MouseEvent) => {
      if (!e.ctrlKey) return

      // Use the xterm screen element as the coordinate reference
      const screen = container.querySelector('.xterm-screen') as HTMLElement | null
      if (!screen) return

      // Cell dimensions via xterm's internal render service
      const core  = (term as any)._core
      const cellW = core?._renderService?.dimensions?.css?.cell?.width  as number | undefined
      const cellH = core?._renderService?.dimensions?.css?.cell?.height as number | undefined
      if (!cellW || !cellH) return

      // Convert click pixel position → terminal column + viewport row
      const rect = screen.getBoundingClientRect()
      const col  = Math.floor((e.clientX - rect.left) / cellW)
      const row  = Math.floor((e.clientY - rect.top)  / cellH)
      if (col < 0 || row < 0) return

      // viewportY is the first buffer line visible in the viewport (scrollback offset)
      const bufferRow = term.buffer.active.viewportY + row
      const bufLine   = term.buffer.active.getLine(bufferRow)
      if (!bufLine) return

      const lineText = bufLine.translateToString(true)
      if (!lineText.trim()) return

      // Expand left and right from the clicked column to extract the full token
      const clampedCol = Math.max(0, Math.min(col, lineText.length - 1))
      if (!isPathChar(lineText[clampedCol])) return

      let start = clampedCol
      while (start > 0 && isPathChar(lineText[start - 1])) start--
      let end = clampedCol + 1
      while (end < lineText.length && isPathChar(lineText[end])) end++

      const token = lineText.slice(start, end).replace(/[/\\]$/, '') // strip trailing slash
      if (!token) return

      CtrlClickPath(tabId, token).catch(() => {})
    }

    container.addEventListener('mousemove', handleCtrlMouseMove)
    container.addEventListener('mousedown', handleCtrlClick)
    window.addEventListener('keydown', handleCtrlKeyDown)
    window.addEventListener('keyup',   handleCtrlKeyUp)

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const current = termRef.current?.options.fontSize ?? 13
      const next = e.deltaY < 0 ? Math.min(current + 1, 36) : Math.max(current - 1, 8)
      if (termRef.current) termRef.current.options.fontSize = next
      fitRef.current?.fit()
      setFontSize(next)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    CreateTerminal(tabId, initialCwd ?? '').catch(() => {})

    const outEvent = `terminal:output:${tabId}`
    EventsOn(outEvent, (data: string) => { term.write(data) })

    const lineRef = { current: '' }

    // ── helpers ───────────────────────────────────────────────────────────────

    const processPaste = (text: string) => {
      setMenu(null)
      const segments = text.split(/\r?\n/)
      segments.forEach((seg, i) => {
        if (seg) { lineRef.current += seg; term.write(seg) }
        if (i < segments.length - 1) {
          const cmd = lineRef.current
          lineRef.current = ''
          term.write('\r\n')
          ExecuteCommand(tabId, cmd)
        }
      })
    }

    const eraseChars = (count: number) => {
      if (count <= 0) return
      term.write(`\x1b[${count}D\x1b[K`)
      lineRef.current = lineRef.current.slice(0, -count)
    }

    // Returns the dir/partial/prefix for the token the cursor is on, or null if
    // we're still typing the command name (no space yet).
    const parseToken = () => {
      const line = lineRef.current
      const lastSpace = line.lastIndexOf(' ')
      if (lastSpace < 0) return null
      const token = line.slice(lastSpace + 1)
      const lastSlash = Math.max(token.lastIndexOf('/'), token.lastIndexOf('\\'))
      const dir = lastSlash >= 0 ? token.slice(0, lastSlash + 1) : ''
      const partial = lastSlash >= 0 ? token.slice(lastSlash + 1) : token
      const prefix = line.slice(0, line.length - partial.length)
      return { dir, partial, prefix }
    }

    // Get xterm cell dimensions (internal API, with fallback).
    const cellDims = () => {
      const core = (term as any)._core
      const h = core?._renderService?.dimensions?.css?.cell?.height ?? (fontSize * 1.45)
      const w = core?._renderService?.dimensions?.css?.cell?.width ?? (fontSize * 0.62)
      return { h, w }
    }

    // ── completion menu ───────────────────────────────────────────────────────

    // Slash-command autocomplete: shown when the line starts with '/' and
    // contains no space yet (user is still typing the command name).
    // Returns true when it handled the update (even if it cleared the menu).
    const updateSlashMenu = (): boolean => {
      const line = lineRef.current
      if (!line.startsWith('/') || line.includes(' ')) return false

      const filtered = SLASH_COMMANDS.filter(c => c.cmd.startsWith(line))
      if (filtered.length === 0) { setMenu(null); return true }

      const { h } = cellDims()
      const rect = container.getBoundingClientRect()
      const cursorRow = term.buffer.active.cursorY
      const top  = rect.top + 6 + (cursorRow + 1) * h
      const left = rect.left + 8

      setMenu({
        matches:      filtered.map(c => c.cmd),
        descriptions: filtered.map(c => c.desc),
        selectedIdx: 0,
        applied: false,
        appliedLen: line.length,
        originalPartial: line,
        prefix: '',
        top,
        left,
      })
      return true
    }

    const updateMenu = () => {
      if (updateSlashMenu()) return

      const parsed = parseToken()
      if (!parsed) { setMenu(null); return }
      const { dir, partial, prefix } = parsed

      GetCompletions(tabId, dir, partial)
        .then((matches: string[]) => {
          if (!matches || matches.length === 0) { setMenu(null); return }

          const { h, w } = cellDims()
          const rect = container.getBoundingClientRect()
          const cursorRow = term.buffer.active.cursorY
          const cursorCol = term.buffer.active.cursorX
          const partialStartCol = cursorCol - partial.length

          const top = rect.top + 6 + (cursorRow + 1) * h
          const left = Math.max(rect.left + 8, rect.left + 8 + partialStartCol * w)

          setMenu({
            matches,
            selectedIdx: 0,
            applied: false,
            appliedLen: partial.length,
            originalPartial: partial,
            prefix,
            top,
            left,
          })
        })
        .catch(() => setMenu(null))
    }

    // Apply a specific match from the menu (used by click handler).
    applyMatchRef.current = (match: string) => {
      const m = menuRef.current
      if (!m) return
      eraseChars(m.appliedLen)
      term.write(match)
      lineRef.current = m.prefix + match
      setMenu(null)
      term.focus()
    }

    // Tab: apply selected match, then advance selection for next Tab.
    const handleTab = () => {
      const m = menuRef.current
      if (!m || m.matches.length === 0) return

      if (!m.applied) {
        // First Tab: apply the first (selected) match
        const match = m.matches[0]
        eraseChars(m.appliedLen)
        term.write(match)
        lineRef.current = m.prefix + match
        setMenu({ ...m, applied: true, appliedLen: match.length, selectedIdx: 0 })
      } else {
        // Subsequent Tab: cycle to next match
        const nextIdx = (m.selectedIdx + 1) % m.matches.length
        const match = m.matches[nextIdx]
        eraseChars(m.appliedLen)
        term.write(match)
        lineRef.current = m.prefix + match
        setMenu({ ...m, appliedLen: match.length, selectedIdx: nextIdx })
      }
    }

    // ── keyboard ──────────────────────────────────────────────────────────────

    const onContainerKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        handleTab()
        return
      }
      if (e.key === 'Escape') {
        const m = menuRef.current
        if (m) {
          e.preventDefault()
          if (m.applied) {
            // Restore the original typed partial
            eraseChars(m.appliedLen)
            term.write(m.originalPartial)
            lineRef.current = m.prefix + m.originalPartial
          }
          setMenu(null)
        }
        return
      }
    }
    container.addEventListener('keydown', onContainerKeyDown, { capture: true })

    // ── paste ─────────────────────────────────────────────────────────────────

    const onWindowPaste = (e: ClipboardEvent) => {
      if (!activeRef.current) return
      e.preventDefault()
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (text) processPaste(text)
    }
    window.addEventListener('paste', onWindowPaste)

    // ── input ─────────────────────────────────────────────────────────────────

    term.onData((data: string) => {
      // Enter
      if (data === '\r' || data === '\n') {
        setMenu(null)
        const line = lineRef.current
        lineRef.current = ''
        term.write('\r\n')
        ExecuteCommand(tabId, line)
        return
      }

      // Backspace
      if (data === '\x7f' || data === '\b') {
        if (lineRef.current.length > 0) {
          lineRef.current = lineRef.current.slice(0, -1)
          term.write('\b \b')
          updateMenu()
        } else {
          setMenu(null)
        }
        return
      }

      // Ctrl+C
      if (data === '\x03') {
        setMenu(null)
        term.write('^C\r\n')
        lineRef.current = ''
        InterruptCommand(tabId)
        return
      }

      // Ctrl+L
      if (data === '\x0c') {
        setMenu(null)
        term.write('\x1b[2J\x1b[H')
        lineRef.current = ''
        ExecuteCommand(tabId, 'clear')
        return
      }

      // Ctrl+U
      if (data === '\x15') {
        setMenu(null)
        if (lineRef.current.length > 0) {
          term.write('\x1b[' + lineRef.current.length + 'D' +
            ' '.repeat(lineRef.current.length) +
            '\x1b[' + lineRef.current.length + 'D')
          lineRef.current = ''
        }
        return
      }

      // Tab — handled by container keydown listener
      if (data === '\x09') return

      // Ctrl+V
      if (data === '\x16') {
        GetClipboardText().then(text => { if (text) processPaste(text) }).catch(() => {})
        return
      }

      // Other control characters
      if (data.charCodeAt(0) < 32) return

      // Printable: write, update menu in real time
      if (data.length > 1) {
        processPaste(data)
      } else {
        lineRef.current += data
        term.write(data)
        updateMenu()
      }
    })

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(containerRef.current!)

    return () => {
      ro.disconnect()
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('keydown', onContainerKeyDown, { capture: true })
      container.removeEventListener('mousemove', handleCtrlMouseMove)
      container.removeEventListener('mousedown', handleCtrlClick)
      window.removeEventListener('keydown', handleCtrlKeyDown)
      window.removeEventListener('keyup',   handleCtrlKeyUp)
      window.removeEventListener('paste', onWindowPaste)
      EventsOff(outEvent)
      CloseTerminal(tabId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
      applyMatchRef.current = null
    }
  }, [tabId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [active])

  return (
    <div className="terminal-pane">
      <div
        className="terminal-cwd"
        onClick={handleCwdClick}
        title="Click to change directory"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 4.5A1.5 1.5 0 012.5 3h3.086a1.5 1.5 0 011.06.44l.915.914A1.5 1.5 0 008.62 4.5H13.5A1.5 1.5 0 0115 6v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12V4.5z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
        <span>{abbreviatePath(cwd)}</span>
      </div>
      <div ref={containerRef} className="terminal-container" />

      {menu && ReactDOM.createPortal(
        <div
          className="completion-menu"
          style={{ top: menu.top, left: menu.left }}
        >
          {menu.matches.map((m, i) => (
            <div
              key={m + i}
              className={`completion-item${i === menu.selectedIdx && menu.applied ? ' applied' : ''}${i === menu.selectedIdx ? ' selected' : ''}`}
              onMouseDown={e => {
                e.preventDefault() // keep terminal focus
                applyMatchRef.current?.(m)
              }}
            >
              <span className="completion-item__name">{m}</span>
              {menu.descriptions?.[i] && (
                <span className="completion-item__desc">{menu.descriptions[i]}</span>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
