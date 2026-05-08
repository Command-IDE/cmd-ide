import React from 'react'
import { Tab } from '../types'
import { WindowMinimise, WindowToggleMaximise } from '../../wailsjs/runtime/runtime'
import './TabBar.css'

interface Props {
  tabs: Tab[]
  activeId: string
  secondaryId: string
  splitEnabled: boolean
  focusedPane: 'primary' | 'secondary'
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNewTerminal: () => void
  onSplitToggle: () => void
  onAddSiblingTerminal: (parentId: string) => void
  onQuit: () => void
}

const TERMINAL_COLORS = [
  '#4fc3f7', '#81c995', '#ffb74d', '#f48fb1',
  '#ce93d8', '#80cbc4', '#bcaaa4',
]

interface Group {
  terminals: Tab[]
  color: string
  files: Tab[]
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function buildGroups(tabs: Tab[]): Group[] {
  const groups: Group[] = []
  const termToGroup = new Map<string, Group>()
  let colorIdx = 0

  for (const tab of tabs) {
    if (tab.type === 'terminal') {
      const parentGroup = tab.parentId ? termToGroup.get(tab.parentId) : null
      if (parentGroup) {
        parentGroup.terminals.push(tab)
        termToGroup.set(tab.id, parentGroup)
      } else {
        const color = TERMINAL_COLORS[colorIdx % TERMINAL_COLORS.length]
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
        groups.push({ terminals: [], color: '#555', files: [tab] })
      }
    }
  }
  return groups
}

// ── icons ─────────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const SplitIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 1v14" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
)

const TerminalIcon = ({ color, dim }: { color: string; dim?: boolean }) => (
  <svg
    width="13" height="13" viewBox="0 0 16 16" fill="none"
    style={{ color, opacity: dim ? 0.5 : 1, flexShrink: 0 }}
  >
    <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M4.5 5.5L7.5 8L4.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.5 10.5H11.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
)

export default function TabBar({
  tabs, activeId, secondaryId, splitEnabled, focusedPane,
  onSelect, onClose, onNewTerminal, onSplitToggle, onAddSiblingTerminal, onQuit,
}: Props) {
  const groups = buildGroups(tabs)

  return (
    <div className="tabbar" style={{ ['--wails-draggable' as any]: 'drag' }} onDoubleClick={WindowToggleMaximise}>

      <div className="tabbar__groups" style={{ ['--wails-draggable' as any]: 'no-drag' }}>
        {groups.map((group, gi) => {
          // A group is "active" if it contains the primary or secondary active tab
          const allIds = [...group.terminals.map(t => t.id), ...group.files.map(f => f.id)]
          const isActive = allIds.includes(activeId) || (!!secondaryId && allIds.includes(secondaryId))
          const rootId   = group.terminals[0]?.id ?? group.files[0]?.id

          // ── Compact (inactive) group ─────────────────────────────────────
          if (!isActive) {
            const totalTabs = group.terminals.length + group.files.length
            return (
              <div
                key={rootId ?? `g${gi}`}
                className="tabbar__group tabbar__group--compact"
                style={{
                  borderColor:     hexToRgba(group.color, 0.22),
                  backgroundColor: hexToRgba(group.color, 0.04),
                }}
                onClick={() => rootId && onSelect(rootId)}
                title={`${group.terminals.length} terminal${group.terminals.length !== 1 ? 's' : ''}${group.files.length ? `, ${group.files.length} file${group.files.length !== 1 ? 's' : ''}` : ''}`}
              >
                {/* Show stacked terminal icons if multiple, otherwise just one */}
                <div className="tabbar__compact-icons">
                  {group.terminals.slice(0, 2).map((t, i) => (
                    <span key={t.id} className="tabbar__compact-icon" style={{ marginLeft: i > 0 ? -5 : 0 }}>
                      <TerminalIcon color={group.color} dim />
                    </span>
                  ))}
                  {group.terminals.length === 0 && (
                    <span className="tabbar__compact-dot" style={{ background: group.color }} />
                  )}
                </div>
                {totalTabs > 1 && (
                  <span className="tabbar__compact-count" style={{ color: group.color }}>
                    {totalTabs}
                  </span>
                )}
              </div>
            )
          }

          // ── Expanded (active) group ──────────────────────────────────────
          return (
            <div
              key={rootId ?? `g${gi}`}
              className="tabbar__group tabbar__group--active"
              style={{
                borderColor:     hexToRgba(group.color, 0.35),
                backgroundColor: hexToRgba(group.color, 0.07),
              }}
            >
              {/* Terminal tabs */}
              {group.terminals.map(term => {
                const isPrimary   = term.id === activeId
                const isSecondary = term.id === secondaryId
                return (
                  <div
                    key={term.id}
                    className={[
                      'tabbar__tab tabbar__tab--terminal',
                      isPrimary   ? 'tabbar__tab--active'    : '',
                      isSecondary ? 'tabbar__tab--secondary'  : '',
                    ].filter(Boolean).join(' ')}
                    style={isPrimary || isSecondary
                      ? { backgroundColor: hexToRgba(group.color, 0.16), color: '#ddd' }
                      : undefined}
                    onClick={() => onSelect(term.id)}
                  >
                    <TerminalIcon color={group.color} dim={!isPrimary && !isSecondary} />
                    {isSecondary && !isPrimary && (
                      <span className="tabbar__pane-badge">2</span>
                    )}
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

              {/* Sibling terminal button — visible on group hover */}
              {group.terminals.length > 0 && (
                <button
                  className="tabbar__group-add"
                  onClick={() => onAddSiblingTerminal(group.terminals[0].id)}
                  title="New terminal in this group"
                  style={{ color: group.color }}
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}

              {/* File / editor / db / preview tabs */}
              {group.files.map(tab => {
                const isPrimary   = tab.id === activeId
                const isSecondary = tab.id === secondaryId
                return (
                  <div
                    key={tab.id}
                    className={[
                      'tabbar__tab tabbar__tab--file',
                      isPrimary   ? 'tabbar__tab--active'    : '',
                      isSecondary ? 'tabbar__tab--secondary'  : '',
                    ].filter(Boolean).join(' ')}
                    style={isPrimary || isSecondary
                      ? { backgroundColor: hexToRgba(group.color, 0.16), color: '#ddd' }
                      : undefined}
                    onClick={() => onSelect(tab.id)}
                    title={tab.filePath ?? tab.title}
                  >
                    <span className="tabbar__dot tabbar__dot--file" style={{ background: group.color }} />
                    <span className="tabbar__title">{tab.title}</span>
                    {isSecondary && !isPrimary && (
                      <span className="tabbar__pane-badge">2</span>
                    )}
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

              {/* Split button — lives at the trailing edge of the active group */}
              <button
                className={`tabbar__split-inline${splitEnabled ? ' tabbar__split-inline--active' : ''}`}
                onClick={onSplitToggle}
                title={splitEnabled ? 'Close split' : 'Split view'}
              >
                <SplitIcon />
              </button>
            </div>
          )
        })}

        {/* New top-level terminal */}
        <button className="tabbar__add" onClick={onNewTerminal} aria-label="New terminal" title="New terminal">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Draggable spacer */}
      <div className="tabbar__spacer" />

      {/* Window controls */}
      <div className="tabbar__wincontrols" style={{ ['--wails-draggable' as any]: 'no-drag' }}>
        <button className="wc-btn wc-min" onClick={WindowMinimise} aria-label="Minimise">
          <svg width="10" height="2" viewBox="0 0 10 2">
            <path d="M0 1h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button className="wc-btn wc-max" onClick={WindowToggleMaximise} aria-label="Maximise">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.75" y="0.75" width="8.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          </svg>
        </button>
        <button className="wc-btn wc-close" onClick={onQuit} aria-label="Close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
