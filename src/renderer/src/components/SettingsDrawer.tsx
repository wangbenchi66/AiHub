import type { ReactElement } from 'react'
import type { Settings, SyncStatus, Theme } from '@shared/types'

const THEMES: Array<{ value: Theme; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

function formatTime(value?: number): string {
  if (!value) return '尚未同步'
  return new Date(value).toLocaleTimeString()
}

export function SettingsDrawer({
  settings,
  sync,
  version,
  platform,
  onUpdate,
  onClose,
  onRerunOnboarding,
  onUnlink,
  onSyncNow,
  onOpenExtensionFolder,
  onOpenExtensionsPage
}: {
  settings: Settings
  sync: SyncStatus
  version: string
  platform: string
  onUpdate: (patch: Partial<Settings>) => void
  onClose: () => void
  onRerunOnboarding: () => void
  onUnlink: () => void
  onSyncNow: () => void
  onOpenExtensionFolder: () => void
  onOpenExtensionsPage: () => void
}): ReactElement {
  const browser = sync.browser
  const connected = sync.connected

  const stateLabel = !browser ? '未链接' : connected ? '已连接' : '等待扩展'

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <h2>设置</h2>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          <section className="drawer-section">
            <h3>外观</h3>
            <div className="segmented">
              {THEMES.map((theme) => (
                <button
                  key={theme.value}
                  className={settings.theme === theme.value ? 'active' : ''}
                  onClick={() => onUpdate({ theme: theme.value })}
                >
                  {theme.label}
                </button>
              ))}
            </div>
            <p className="hint">默认跟随系统；Windows / macOS 都使用原生窗口按钮。</p>
          </section>

          <section className="drawer-section">
            <h3>登录态共享</h3>
            {browser ? (
              <div className="browser-card">
                <div className="browser-card-top">
                  <span className={`status-dot ${connected ? 'connected' : 'waiting'}`} />
                  <div className="browser-meta">
                    <b>{browser.label}</b>
                    <span>{browser.profileName || browser.profileDir}</span>
                  </div>
                  <span className="state-pill">{stateLabel}</span>
                </div>
                <div className="path" title={browser.exe}>{browser.exe}</div>

                <div className="sync-meta">
                  <span>上次同步：{formatTime(sync.lastSyncAt)}</span>
                  <span>{connected ? `端口 ${sync.port ?? '—'}` : '扩展未连接'}</span>
                </div>

                <div className="browser-actions">
                  <button className="btn primary" onClick={onSyncNow}>立即同步</button>
                  <button className="btn" onClick={onOpenExtensionFolder}>扩展目录</button>
                  <button className="btn" onClick={onOpenExtensionsPage}>扩展管理页</button>
                </div>
                <div className="browser-actions">
                  <button className="btn" onClick={onRerunOnboarding}>更换浏览器</button>
                  <button className="btn danger" onClick={onUnlink}>解除链接</button>
                </div>
              </div>
            ) : (
              <div className="empty-card">
                <p>还没有链接浏览器</p>
                <span>选择 Chrome / Edge 等浏览器后，AiHub 才能共享登录态。</span>
                <button className="btn primary" onClick={onRerunOnboarding}>选择浏览器</button>
              </div>
            )}

            {browser && !connected ? (
              <div className="notice">
                在浏览器扩展管理页加载 Bridge 扩展后，这里会自动变成“已连接”。
                如果浏览器没启动，先启动一次。
              </div>
            ) : null}

            <div className="policy-row">
              <span>冲突策略</span>
              <select
                value={settings.sync.conflict}
                onChange={(event) => onUpdate({
                  sync: {
                    ...settings.sync,
                    conflict: event.target.value === 'app' ? 'app' : 'browser'
                  }
                })}
              >
                <option value="browser">以浏览器为准</option>
                <option value="app">以 AiHub 为准</option>
              </select>
            </div>

            <div className="notice">
              全站凭证模式：浏览器中所有站点的 Cookie、localStorage 和 sessionStorage 都会参与双向同步，包括 Google / Microsoft 等登录态。
            </div>
          </section>

          <section className="drawer-section">
            <h3>关于</h3>
            <div className="about-row"><span>版本</span><b>{version}</b></div>
            <div className="about-row"><span>平台</span><b>{platform}</b></div>
            <div className="about-row"><span>范围</span><b>Cookie + Web Storage 同步，不导入插件</b></div>
            <p className="hint">窗口控制、菜单、快捷键均走系统原生行为。</p>
          </section>
        </div>
      </aside>
    </div>
  )
}
