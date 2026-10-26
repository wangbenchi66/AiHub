import type { ReactElement } from 'react'
import type { Provider, SyncStatus } from '@shared/types'
import { AppGrid } from './AppGrid'
import { SearchBar } from './SearchBar'
import type { RailView } from './Sidebar'

function urlFromQuery(query: string): string | null {
  const value = query.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(value)) return `https://${value}`
  return null
}

export function Home({
  view,
  providers,
  favorites,
  query,
  sync,
  shortcutLabel,
  onQuery,
  onSubmit,
  onOpen,
  onOpenUrl,
  onToggleFavorite,
  onAdd
}: {
  view: RailView
  providers: Provider[]
  favorites: string[]
  query: string
  sync: SyncStatus
  shortcutLabel: string
  onQuery: (value: string) => void
  onSubmit: (value: string) => void
  onOpen: (provider: Provider) => void
  onOpenUrl: (url: string) => void
  onToggleFavorite: (provider: Provider) => void
  onAdd: () => void
}): ReactElement {
  const url = urlFromQuery(query)
  const title =
    view === 'recent' ? '最近使用' : view === 'favorites' ? '收藏' : null

  return (
    <section className="content home-content">
      <div className="scroll">
        <SearchBar value={query} onChange={onQuery} onSubmit={onSubmit} shortcutLabel={shortcutLabel} />

        {title ? <div className="section-title">{title}</div> : null}

        {url ? (
          <button className="url-result" onClick={() => onOpenUrl(url)}>
            <span className="url-ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" />
                <path d="M3.8 12h16.4M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
              </svg>
            </span>
            <span className="url-text">
              <b>打开网址</b>
              <span>{url}</span>
            </span>
            <kbd>Enter</kbd>
          </button>
        ) : null}

        {providers.length === 0 && !url ? (
          <div className="empty">
            <p>{view === 'favorites' ? '还没有收藏的站点' : view === 'recent' ? '还没有使用记录' : '没有找到匹配的站点'}</p>
            <span>{query ? '换个关键词，或粘贴网址直接打开' : '点击右下角的 + 添加自定义站点'}</span>
          </div>
        ) : (
          <AppGrid
            providers={providers}
            favorites={favorites}
            onOpen={onOpen}
            onToggleFavorite={onToggleFavorite}
            onAdd={view === 'home' ? onAdd : undefined}
          />
        )}
      </div>

      <footer className="footer">
        <div className="left">
          <span>{providers.length} 个 AI 工具</span>
          <span>星标可收藏</span>
        </div>
        <div className="right">
          <span className={`dot ${sync.state}`} />
          <span>
            {sync.state === 'coming-soon'
              ? '已选择浏览器，等待同步引擎'
              : sync.state === 'connected'
                ? '双向同步已连接'
                : sync.state === 'disabled'
                  ? '未链接浏览器'
                  : '同步未连接'}
          </span>
        </div>
      </footer>
    </section>
  )
}
