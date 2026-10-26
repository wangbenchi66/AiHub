import type { ReactElement, MouseEvent } from 'react'
import type { Provider, SyncStatus, TabState } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'
import appIcon from '../assets/app-icon.png'

export type RailView = 'home' | 'recent' | 'favorites'

function syncText(sync: SyncStatus): string {
  const browser = sync.browser?.label.replace(/^Google /, '') ?? '浏览器'
  switch (sync.state) {
    case 'connected':
      return `双向同步 · ${browser}`
    case 'waiting':
      return `等待 ${browser}`
    case 'browser-missing':
      return '未找到浏览器'
    case 'coming-soon':
      return `已选择 · ${browser}`
    default:
      return '未链接浏览器'
  }
}

export function Sidebar({
  tabs,
  titles,
  activeTabId,
  providers,
  sync,
  view,
  collapsed,
  onSelectTab,
  onCloseTab,
  onHome,
  onNew,
  onView,
  onSettings,
  onHelp,
  onFocusSearch,
  onToggleSidebar
}: {
  tabs: TabState[]
  titles: Record<string, string>
  activeTabId: string
  providers: Provider[]
  sync: SyncStatus
  view: RailView
  collapsed: boolean
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onHome: () => void
  onNew: () => void
  onView: (view: RailView) => void
  onSettings: () => void
  onHelp: () => void
  onFocusSearch: () => void
  onToggleSidebar: () => void
}): ReactElement {
  const byId = new Map(providers.map((p) => [p.id, p]))

  const close = (event: MouseEvent, tabId: string): void => {
    event.stopPropagation()
    onCloseTab(tabId)
  }

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="side-brand">
        <div className="logo" title="AiHub">
          <img src={appIcon} alt="" />
        </div>
        <div className="brand-name">AiHub</div>
        <button className="side-icon-btn" title="搜索（Ctrl/Cmd K）" onClick={onFocusSearch}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
          </svg>
        </button>
      </div>

      <button className="new-tab-btn" onClick={onNew} title="新建标签（回到 AI 广场）">
        <span className="plus-box">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </span>
        <span>新建标签</span>
      </button>

      <div className="side-section side-tabs-section">
        <div className="side-label">
          <span>已打开</span>
          <span className="count">{tabs.length + 1}</span>
        </div>
        <div className="tab-list">
          <div
            className={`side-tab${activeTabId === 'home' ? ' active' : ''}`}
            onClick={onHome}
            title="AI 广场"
          >
            <span className="side-tab-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="4" y="4" width="6" height="6" rx="1.4" />
                <rect x="14" y="4" width="6" height="6" rx="1.4" />
                <rect x="4" y="14" width="6" height="6" rx="1.4" />
                <rect x="14" y="14" width="6" height="6" rx="1.4" />
              </svg>
            </span>
            <span className="side-tab-title">AI 广场</span>
            <span className="side-tab-pin" title="固定标签">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.6 1.8l4.6 4.6-1.9 1.9-.6-.2-2.4 2.4.2 1.2-1.3 1.3L4 8.8l1.3-1.3 1.2.2L8.9 5.3l-.2-.6 1.9-1.9zM5.7 10.3l-3 3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </span>
          </div>

          {tabs.map((tab) => {
            const provider = byId.get(tab.providerId)
            if (!provider) return null
            return (
              <div
                key={tab.tabId}
                className={`side-tab${activeTabId === tab.tabId ? ' active' : ''}`}
                title={titles[tab.tabId] || provider.name}
                onClick={() => onSelectTab(tab.tabId)}
                onMouseDown={(event) => {
                  if (event.button === 1) {
                    event.preventDefault()
                    onCloseTab(tab.tabId)
                  }
                }}
              >
                <span className="side-tab-ico">
                  <ProviderIcon provider={provider} size={16} />
                </span>
                <span className="side-tab-title">{provider.name}</span>
                <button
                  className="side-tab-close"
                  title="关闭标签"
                  onClick={(event) => close(event, tab.tabId)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M2 2l6 6M8 2L2 8" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="side-section side-nav-section">
        <div className="side-label">
          <span>工作台</span>
        </div>
        <button
          className={`side-nav${activeTabId === 'home' && view === 'home' ? ' active' : ''}`}
          title="全部应用"
          onClick={() => { onHome(); onView('home') }}
        >
          <span className="side-nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
              <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
              <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
            </svg>
          </span>
          <span className="side-nav-label">全部应用</span>
          <span className="side-nav-count">{providers.length}</span>
        </button>
        <button
          className={`side-nav${activeTabId === 'home' && view === 'recent' ? ' active' : ''}`}
          title="最近使用"
          onClick={() => { onHome(); onView('recent') }}
        >
          <span className="side-nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 7.5V12l3 2" />
            </svg>
          </span>
          <span className="side-nav-label">最近使用</span>
        </button>
        <button
          className={`side-nav${activeTabId === 'home' && view === 'favorites' ? ' active' : ''}`}
          title="收藏"
          onClick={() => { onHome(); onView('favorites') }}
        >
          <span className="side-nav-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.6l2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8L12 3.6z" />
            </svg>
          </span>
          <span className="side-nav-label">收藏</span>
        </button>
      </div>

      <div className="side-bottom">
        <button className={`sync-status ${sync.state}`} title={`${syncText(sync)} · 点击设置登录态共享`} onClick={onSettings}>
          <span className="dot" />
          <span>{syncText(sync)}</span>
        </button>
        <div className="side-footer">
          <button className="side-icon-btn" title="帮助" onClick={onHelp}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button className="side-icon-btn" title="设置" onClick={onSettings}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.56V20.4h-3v-.18a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7.1 15a1.7 1.7 0 0 0-1.56-1H5.4v-3h.14a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.76 6a1.7 1.7 0 0 0 1-1.56V4.3h3v.14a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 9.6a1.7 1.7 0 0 0 1.56 1h.14v3h-.14a1.7 1.7 0 0 0-1.56 1z" />
            </svg>
          </button>
          <div className="avatar" title="本地用户">A</div>
        </div>
        <button
          className="side-nav sidebar-toggle-row"
          title={collapsed ? '展开侧栏（Ctrl/Cmd+B）' : '收起侧栏（Ctrl/Cmd+B）'}
          aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
          aria-expanded={!collapsed}
          onClick={onToggleSidebar}
        >
          <span className="side-nav-ico">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={collapsed ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
            </svg>
          </span>
          <span className="side-nav-label">{collapsed ? '展开侧栏' : '收起侧栏'}</span>
        </button>
      </div>
    </aside>
  )
}
