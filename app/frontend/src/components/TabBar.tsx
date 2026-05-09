import React from 'react'
import { Tab } from '../types'
import { WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime'
import './TabBar.css'

interface Props {
  tabs:         Tab[]
  activeId:     string
  secondaryId:  string
  splitEnabled: boolean
  focusedPane:  'primary' | 'secondary'
  onSelect:              (id: string) => void
  onClose:               (id: string) => void
  onNewTerminal:         () => void
  onSplitToggle:         () => void
  onAddSiblingTerminal:  (parentId: string) => void
  onQuit:                () => void
}

// ── Palette ────────────────────────────────────────────────────────────────────

const GROUP_COLORS = [
  '#4fc3f7', // sky blue
  '#81c995', // green
  '#ffb74d', // amber
  '#f48fb1', // pink
  '#ce93d8', // purple
  '#80cbc4', // teal
  '#bcaaa4', // warm grey
]

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Group {
  terminals: Tab[]
  color:     string
  files:     Tab[]
}

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

function buildGroups(tabs: Tab[]): Group[] {
  const groups: Group[]          = []
  const termToGroup              = new Map<string, Group>()
  let colorIdx = 0

  for (const tab of tabs) {
    if (tab.type === 'terminal') {
      const parent = tab.parentId ? termToGroup.get(tab.parentId) : null
      if (parent) {
        parent.terminals.push(tab)
        termToGroup.set(tab.id, parent)
      } else {
        const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length]
        colorIdx++
        const g: Group = { terminals: [tab], color, files: [] }
        groups.push(g)
        termToGroup.set(tab.id, g)
      }
    } else {
      const group = tab.parentId ? termToGroup.get(tab.parentId) : null
      if (group) {
        group.files.push(tab)
      } else if (groups.length > 0) {
        groups[groups.length - 1].files.push(tab)
      } else {
        groups.push({ terminals: [], color: GROUP_COLORS[0], files: [tab] })
      }
    }
  }
  return groups
}

// ── SVG icons ──────────────────────────────────────────────────────────────────

const TerminalIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    style={{ color, flexShrink: 0 }}>
    <path d="M2.5 5.5l3.5 2.5-3.5 2.5"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 10.5h5.5"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
  </svg>
)

const FileIcon = ({ color }: { color: string }) => (
  <svg width="11" height="12" viewBox="0 0 14 16" fill="none"
    style={{ color, flexShrink: 0 }}>
    <path d="M2 1.5h7.5L12 4v10H2V1.5z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M9.5 1.5V4H12"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
)

const DatabaseIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    style={{ color, flexShrink: 0 }}>
    <ellipse cx="8" cy="4" rx="5" ry="1.8"
      stroke="currentColor" strokeWidth="1.3"/>
    <path d="M3 4v8c0 1 2.24 1.8 5 1.8s5-.8 5-1.8V4"
      stroke="currentColor" strokeWidth="1.3"/>
    <path d="M3 8c0 1 2.24 1.8 5 1.8s5-.8 5-1.8"
      stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const PreviewIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    style={{ color, flexShrink: 0 }}>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2.5 8h11" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2.5c-1.5 1.5-2 3.3-2 5.5s.5 4 2 5.5M8 2.5c1.5 1.5 2 3.3 2 5.5s-.5 4-2 5.5"
      stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

// Palette / theme editor icon
const PaletteIcon = ({ color }: { color: string }) => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    style={{ color, flexShrink: 0 }}>
    <path d="M8 2C4.69 2 2 4.69 2 8s2.69 6 6 6c.55 0 1-.45 1-1 0-.26-.1-.49-.26-.67-.14-.18-.24-.4-.24-.63 0-.55.45-1 1-1H11c2.21 0 4-1.79 4-4 0-3.31-3.13-5-7-5z"
      stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <circle cx="5.5"  cy="7.5"  r="0.9" fill="currentColor"/>
    <circle cx="8"    cy="5.5"  r="0.9" fill="currentColor"/>
    <circle cx="10.5" cy="7.5"  r="0.9" fill="currentColor"/>
  </svg>
)

// Problems always uses warning-amber (theme-independent)
const ProblemsIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"
    style={{ color: '#dda055', flexShrink: 0 }}>
    <path d="M8 2.5L14.5 13H1.5L8 2.5z"
      stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M8 6.5v3.5"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="8" cy="11.5" r="0.65" fill="currentColor"/>
  </svg>
)

const SplitIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2.5"
      stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 1v14" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const CloseIcon = () => (
  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
    <path d="M1 1l8 8M9 1L1 9"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
)

function tabIcon(tab: Tab, color: string): React.ReactNode {
  switch (tab.type) {
    case 'editor':   return <FileIcon color={color} />
    case 'database': return <DatabaseIcon color={color} />
    case 'preview':  return <PreviewIcon color={color} />
    case 'problems': return <ProblemsIcon />
    case 'config':   return <PaletteIcon color={color} />
    default:         return <FileIcon color={color} />
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TabBar({
  tabs, activeId, secondaryId, splitEnabled,
  onSelect, onClose, onNewTerminal, onSplitToggle, onAddSiblingTerminal, onQuit,
}: Props) {
  const groups = buildGroups(tabs)

  return (
    <div
      className="tabbar"
      style={{ ['--wails-draggable' as any]: 'drag' }}
      onDoubleClick={WindowToggleMaximise}
    >
      {/* ── Scrollable flat tab strip ──────────────────────────────────────── */}
      <div className="tabbar__strip" style={{ ['--wails-draggable' as any]: 'no-drag' }}>

        {groups.map((group, gi) => {
          const firstTermId = group.terminals[0]?.id
          return (
            <React.Fragment key={firstTermId ?? `g${gi}`}>

              {/* Group divider — not before the first group */}
              {gi > 0 && <div className="tabbar__sep" />}

              {/* Grouped wrapper: lets CSS :hover show sibling-add button */}
              <div className="tabbar__group">

                {/* Terminal tabs */}
                {group.terminals.map(term => {
                  const isActive    = term.id === activeId
                  const isSecondary = !isActive && term.id === secondaryId
                  return (
                    <div
                      key={term.id}
                      className={`tabbar__tab${isActive ? ' is-active' : ''}${isSecondary ? ' is-secondary' : ''}`}
                      style={
                        isActive    ? { '--tab-accent': group.color, background: rgba(group.color, 0.1) } as React.CSSProperties :
                        isSecondary ? { '--tab-accent': 'rgba(180,150,250,0.7)' } as React.CSSProperties :
                        undefined
                      }
                      onClick={() => onSelect(term.id)}
                      title={term.title}
                    >
                      <TerminalIcon color={isActive || isSecondary ? group.color : rgba(group.color, 0.45)} />
                      <span className="tabbar__tab-title">{term.title}</span>
                      {isSecondary && <span className="tabbar__badge-2">2</span>}
                      <button
                        className="tabbar__close"
                        onClick={e => { e.stopPropagation(); onClose(term.id) }}
                        aria-label="Close"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  )
                })}

                {/* Sibling terminal "+" — appears on group hover */}
                {firstTermId && (
                  <button
                    className="tabbar__sib-add"
                    style={{ color: group.color }}
                    onClick={() => onAddSiblingTerminal(firstTermId)}
                    title="New terminal in this group"
                  >
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M5 1v8M1 5h8"
                        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}

                {/* File / DB / preview / problems tabs */}
                {group.files.map(tab => {
                  const isActive    = tab.id === activeId
                  const isSecondary = !isActive && tab.id === secondaryId
                  const iconColor   = isActive ? group.color : rgba(group.color, 0.5)
                  return (
                    <div
                      key={tab.id}
                      className={`tabbar__tab tabbar__tab--file${isActive ? ' is-active' : ''}${isSecondary ? ' is-secondary' : ''}`}
                      style={
                        isActive    ? { '--tab-accent': group.color, background: rgba(group.color, 0.08) } as React.CSSProperties :
                        isSecondary ? { '--tab-accent': 'rgba(180,150,250,0.7)' } as React.CSSProperties :
                        undefined
                      }
                      onClick={() => onSelect(tab.id)}
                      title={tab.filePath ?? tab.title}
                    >
                      {tabIcon(tab, iconColor)}
                      <span className="tabbar__tab-title">{tab.title}</span>
                      {isSecondary && <span className="tabbar__badge-2">2</span>}
                      <button
                        className="tabbar__close"
                        onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                        aria-label="Close"
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  )
                })}

              </div>{/* end .tabbar__group */}

            </React.Fragment>
          )
        })}

        {/* New top-level terminal */}
        <button
          className="tabbar__new-term"
          onClick={onNewTerminal}
          title="New terminal"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

      </div>{/* end .tabbar__strip */}

      {/* Draggable spacer */}
      <div className="tabbar__spacer" />

      {/* Split-view toggle */}
      <button
        className={`tabbar__split${splitEnabled ? ' is-active' : ''}`}
        onClick={onSplitToggle}
        title={splitEnabled ? 'Close split' : 'Split view'}
        style={{ ['--wails-draggable' as any]: 'no-drag' }}
      >
        <SplitIcon />
      </button>

      {/* Window controls */}
      <div className="tabbar__wincontrols" style={{ ['--wails-draggable' as any]: 'no-drag' }}>
        <button className="wc-btn wc-min" onClick={WindowMinimise} aria-label="Minimise">
          <svg width="10" height="2" viewBox="0 0 10 2">
            <path d="M0 1h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="wc-btn wc-max" onClick={WindowToggleMaximise} aria-label="Maximise">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1.5"
              stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
        </button>
        <button className="wc-btn wc-close" onClick={onQuit} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1L1 9"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

    </div>
  )
}
