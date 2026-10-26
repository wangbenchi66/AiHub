import type { MouseEvent, ReactElement } from 'react'
import type { Provider, TabState } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'

export function TopTabs({
  tabs,
  titles,
  activeTabId,
  providers,
  homeOpen,
  onSelect,
  onClose,
  onCloseHome,
  onHome,
  onNew
}: {
  tabs: TabState[]
  titles: Record<string, string>
  activeTabId: string
  providers: Provider[]
  homeOpen: boolean
  onSelect: (tabId: string) => void
  onClose: (tabId: string) => void
  onCloseHome: () => void
  onHome: () => void
  onNew: () => void
}): ReactElement {
  const byId = new Map(providers.map((provider) => [provider.id, provider]))

  return (
    <div className="top-tabs" role="tablist" aria-label="打开的标签">
      {homeOpen ? (
        <div
          className={`top-tab top-tab-home${activeTabId === 'home' ? ' active' : ''}`}
          role="tab"
          aria-selected={activeTabId === 'home'}
          tabIndex={0}
          title="AI 广场"
          onClick={onHome}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onHome()
            }
          }}
          onMouseDown={(event) => {
            if (event.button === 1) {
              event.preventDefault()
              onCloseHome()
            }
          }}
        >
          <span className="top-tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="4" y="4" width="6" height="6" rx="1.4" />
              <rect x="14" y="4" width="6" height="6" rx="1.4" />
              <rect x="4" y="14" width="6" height="6" rx="1.4" />
              <rect x="14" y="14" width="6" height="6" rx="1.4" />
            </svg>
          </span>
          <span className="top-tab-title">AI 广场</span>
          <button
            className="top-tab-close"
            title="关闭标签"
            aria-label="关闭 AI 广场"
            onClick={(event) => {
              event.stopPropagation()
              onCloseHome()
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 2l6 6M8 2L2 8" />
            </svg>
          </button>
        </div>
      ) : null}

      {tabs.map((tab) => {
        const provider = byId.get(tab.providerId)
        if (!provider) return null
        const active = activeTabId === tab.tabId
        const close = (event: MouseEvent): void => {
          event.stopPropagation()
          onClose(tab.tabId)
        }
        return (
          <div
            key={tab.tabId}
            className={`top-tab${active ? ' active' : ''}`}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            title={titles[tab.tabId] || provider.name}
            onClick={() => onSelect(tab.tabId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(tab.tabId)
              }
            }}
            onMouseDown={(event) => {
              if (event.button === 1) {
                event.preventDefault()
                onClose(tab.tabId)
              }
            }}
          >
            <span className="top-tab-icon">
              <ProviderIcon provider={provider} size={14} />
            </span>
            <span className="top-tab-title">{provider.name}</span>
            <button
              className="top-tab-close"
              title="关闭标签"
              aria-label="关闭标签"
              onClick={close}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M2 2l6 6M8 2L2 8" />
              </svg>
            </button>
          </div>
        )
      })}

      <button className="top-tab-add" title="新建标签" aria-label="新建标签" onClick={onNew}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
    </div>
  )
}
