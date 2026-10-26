import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type {
  Bootstrap,
  BrowserBinding,
  BrowserInfo,
  Provider,
  Settings,
  SyncPolicy,
  SyncStatus,
  TabState
} from '@shared/types'
import { Sidebar, type RailView } from './components/Sidebar'
import { TopTabs } from './components/TopTabs'
import { Home } from './components/Home'
import { ProviderView } from './components/ProviderView'
import { SettingsDrawer } from './components/SettingsDrawer'
import { Onboarding } from './components/Onboarding'
import { AddProviderDialog } from './components/AddProviderDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { Toast } from './components/Toast'
import appIcon from './assets/app-icon.png'

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

function isUrlLike(value: string): boolean {
  const trimmed = value.trim()
  return /^https?:\/\//i.test(trimmed) || /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed)
}

export default function App(): ReactElement {
  const [boot, setBoot] = useState<Bootstrap | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [sync, setSync] = useState<SyncStatus>({ enabled: false, state: 'disabled', connected: false, browser: null })
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([])
  const [tabs, setTabs] = useState<TabState[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [activeTabId, setActiveTabId] = useState('home')
  const [homeOpen, setHomeOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('aihub.homeOpen') !== '0'
    } catch {
      return true
    }
  })
  const [loaded, setLoaded] = useState<Set<string>>(new Set(['home']))
  const [view, setView] = useState<RailView>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('aihub.sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [deletingProvider, setDeletingProvider] = useState<Provider | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((message: string): void => {
    setToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    let alive = true
    window.aihub
      .bootstrap()
      .then((data) => {
        if (!alive) return
        setBoot(data)
        setSettings(data.settings)
        setSync(data.sync)
        setBrowsers(data.browsers)

        const ids = new Set(data.settings.providers.map((p) => p.id))
        const restored = data.settings.tabs.open
          .filter((tab) => ids.has(tab.providerId))
          .slice(0, 12)
        const intended = data.settings.tabs.activeTabId
        const nextActive =
          intended === 'home' || restored.some((tab) => tab.tabId === intended)
            ? intended
            : restored[0]?.tabId ?? 'home'
        setTabs(restored)
        setActiveTabId(nextActive)
        if (nextActive === 'home') setHomeOpen(true)
        setLoaded(new Set(['home', nextActive]))
        if (!data.settings.onboardingCompleted) setOnboardingOpen(true)
        setReady(true)
      })
      .catch((error) => {
        if (!alive) return
        showToast(error instanceof Error ? error.message : '应用初始化失败')
        setReady(true)
      })
    return () => {
      alive = false
    }
  }, [showToast])

  useEffect(() => {
    const unsubscribe = window.aihub.onSyncChanged((status) => setSync(status))
    return unsubscribe
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('aihub.sidebarCollapsed', sidebarCollapsed ? '1' : '0')
    } catch {
      // ignore private mode / storage errors
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    try {
      window.localStorage.setItem('aihub.homeOpen', homeOpen ? '1' : '0')
    } catch {
      // ignore private mode / storage errors
    }
  }, [homeOpen])

  useEffect(() => {
    if (!settings) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (settings.theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [settings])

  useEffect(() => {
    if (!ready) return
    const timer = window.setTimeout(() => {
      void window.aihub.saveTabs(tabs, activeTabId)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [tabs, activeTabId, ready])

  useEffect(() => {
    if (activeTabId !== 'home') {
      setLoaded((prev) => {
        if (prev.has(activeTabId)) return prev
        const next = new Set(prev)
        next.add(activeTabId)
        return next
      })
    }
  }, [activeTabId])

  const updateSettings = useCallback(async (patch: Partial<Settings>): Promise<Settings | null> => {
    try {
      const next = await window.aihub.updateSettings(patch)
      setSettings(next)
      return next
    } catch (error) {
      showToast(error instanceof Error ? error.message : '保存设置失败')
      return null
    }
  }, [showToast])

  const openProvider = useCallback((provider: Provider): void => {
    setTabs((prev) => {
      const existing = prev.find((tab) => tab.providerId === provider.id)
      if (existing) {
        setActiveTabId(existing.tabId)
        setLoaded((set) => new Set(set).add(existing.tabId))
        return prev
      }
      const tab: TabState = {
        tabId: `tab-${provider.id}-${Date.now()}`,
        providerId: provider.id
      }
      setActiveTabId(tab.tabId)
      setLoaded((set) => new Set(set).add(tab.tabId))
      return [...prev, tab]
    })
    setQuery('')
    const current = settings
    if (current) {
      const recent = [provider.id, ...current.recent.filter((id) => id !== provider.id)].slice(0, 10)
      void updateSettings({ recent })
    }
  }, [settings, updateSettings])

  const closeTab = useCallback((tabId: string): void => {
    const index = tabs.findIndex((tab) => tab.tabId === tabId)
    if (index < 0) return
    const next = tabs.filter((tab) => tab.tabId !== tabId)
    setTabs(next)
    setTitles((prev) => {
      const copy = { ...prev }
      delete copy[tabId]
      return copy
    })
    if (activeTabId === tabId) {
      const fallback = next[index - 1] ?? next[index] ?? null
      setActiveTabId(fallback?.tabId ?? 'home')
      if (!fallback) setView('home')
    }
    // 所有标签都关闭后，自动打开默认的 AI 广场。
    if (next.length === 0) {
      setHomeOpen(true)
      setActiveTabId('home')
      setView('home')
    }
  }, [tabs, activeTabId])

  const openHome = useCallback((): void => {
    setHomeOpen(true)
    setView('home')
    setActiveTabId('home')
  }, [])

  const closeHome = useCallback((): void => {
    if (!homeOpen) return
    if (tabs.length === 0) {
      // 关闭 AI 广场后没有任何标签：按默认行为重新打开它。
      setHomeOpen(true)
      setActiveTabId('home')
      setView('home')
      return
    }
    setHomeOpen(false)
    if (activeTabId === 'home') {
      const fallback = tabs[tabs.length - 1]
      setActiveTabId(fallback.tabId)
    }
  }, [homeOpen, tabs, activeTabId])

  const focusSearch = useCallback((): void => {
    setHomeOpen(true)
    setView('home')
    setActiveTabId('home')
    window.setTimeout(() => document.getElementById('global-search')?.focus(), 30)
  }, [])

  const openUrl = useCallback(async (value: string): Promise<void> => {
    const url = normalizeUrl(value)
    let parsed: URL
    try {
      parsed = new URL(url)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
    } catch {
      showToast('网址格式不正确')
      return
    }
    const existing = settings?.providers.find((p) => p.url === url)
    if (existing) {
      openProvider(existing)
      return
    }
    const provider: Provider = {
      id: `custom-${Date.now()}`,
      name: parsed.hostname.replace(/^www\./, ''),
      url,
      icon: '',
      color: '#5B5BD6',
      group: '工具',
      enabled: true,
      custom: true
    }
    try {
      const nextProviders = [...(settings?.providers ?? []), provider]
      const saved = await window.aihub.saveProviders(nextProviders)
      setSettings((prev) => (prev ? { ...prev, providers: saved } : prev))
      openProvider(provider)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开网址失败')
    }
  }, [settings, openProvider, showToast])

  const handleSubmit = useCallback((value: string): void => {
    const trimmed = value.trim()
    if (!trimmed) return
    const target = (settings?.providers ?? []).find((p) =>
      p.name.toLowerCase().includes(trimmed.toLowerCase())
    )
    if (target) {
      openProvider(target)
      return
    }
    if (isUrlLike(trimmed)) {
      void openUrl(trimmed)
      return
    }
    showToast('没有找到匹配的站点，按 Enter 可直接打开网址')
  }, [settings, openProvider, openUrl, showToast])

  const saveProvider = useCallback(async (provider: Provider): Promise<void> => {
    if (!settings) return
    const exists = settings.providers.some((item) => item.id === provider.id)
    const providers = exists
      ? settings.providers.map((item) => (item.id === provider.id ? provider : item))
      : [...settings.providers, provider]
    const next = await updateSettings({ providers })
    if (!next) return
    setAddOpen(false)
    setEditingProvider(null)
    if (!exists) openProvider(provider)
    else showToast('已保存')
  }, [settings, updateSettings, openProvider, showToast])

  const deleteProvider = useCallback(async (provider: Provider): Promise<void> => {
    if (!settings) return
    const providers = settings.providers.filter((item) => item.id !== provider.id)
    const favorites = settings.favorites.filter((id) => id !== provider.id)
    const recent = settings.recent.filter((id) => id !== provider.id)
    const next = await updateSettings({ providers, favorites, recent })
    if (!next) return
    setDeletingProvider(null)
    const affected = tabs.filter((tab) => tab.providerId === provider.id)
    if (affected.length === 0) {
      showToast(`已删除 ${provider.name}`)
      return
    }
    const remaining = tabs.filter((tab) => tab.providerId !== provider.id)
    setTabs(remaining)
    setTitles((prev) => {
      const copy = { ...prev }
      for (const tab of affected) delete copy[tab.tabId]
      return copy
    })
    if (affected.some((tab) => tab.tabId === activeTabId)) {
      setActiveTabId(remaining.length ? remaining[remaining.length - 1].tabId : 'home')
      if (remaining.length === 0) setView('home')
    }
    if (remaining.length === 0) {
      setHomeOpen(true)
      setActiveTabId('home')
      setView('home')
    }
    showToast(`已删除 ${provider.name}`)
  }, [settings, tabs, activeTabId, updateSettings, showToast])

  const toggleFavorite = useCallback((provider: Provider): void => {
    const current = settings
    if (!current) return
    const favorites = current.favorites.includes(provider.id)
      ? current.favorites.filter((id) => id !== provider.id)
      : [...current.favorites, provider.id]
    void updateSettings({ favorites })
  }, [settings, updateSettings])

  const rerunOnboarding = useCallback(async (): Promise<void> => {
    try {
      const list = await window.aihub.detectBrowsers()
      setBrowsers(list)
      setOnboardingOpen(true)
      setSettingsOpen(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '检测浏览器失败')
    }
  }, [showToast])

  const linkBrowser = useCallback(async (
    binding: BrowserBinding,
    policy: SyncPolicy
  ): Promise<void> => {
    const status = await window.aihub.linkBrowser(binding, policy)
    setSync({ ...status, enabled: true, browser: binding })
    setSettings((prev) => prev ? {
      ...prev,
      onboardingCompleted: true,
      sync: {
        ...prev.sync,
        enabled: true,
        browser: binding,
        conflict: policy.conflict
      }
    } : prev)
    setOnboardingOpen(false)
    showToast(
      status.connected
        ? `已链接 ${binding.label}，双向同步已连接`
        : `已链接 ${binding.label}，等待 Bridge 扩展连接`
    )
  }, [showToast])

  const skipOnboarding = useCallback((): void => {
    setOnboardingOpen(false)
    void updateSettings({ onboardingCompleted: true })
  }, [updateSettings])

  const unlinkBrowser = useCallback(async (): Promise<void> => {
    try {
      const status = await window.aihub.unlinkBrowser()
      setSync(status)
      setSettings((prev) => prev ? {
        ...prev,
        sync: { ...prev.sync, enabled: false, browser: null }
      } : prev)
      showToast('已解除浏览器链接')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '解除失败')
    }
  }, [showToast])

  const syncNow = useCallback(async (): Promise<void> => {
    try {
      const status = await window.aihub.syncNow()
      setSync(status)
      showToast(status.connected ? '已请求全量同步' : '等待 Bridge 扩展连接后自动同步')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '同步失败')
    }
  }, [showToast])

  const openExtensionFolder = useCallback(async (): Promise<void> => {
    try {
      await window.aihub.openExtensionFolder()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开扩展目录失败')
    }
  }, [showToast])

  const openExtensionsPage = useCallback(async (): Promise<void> => {
    try {
      await window.aihub.openExtensionsPage()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '打开扩展管理页失败')
    }
  }, [showToast])

  const platformLabel = boot?.platform === 'darwin' ? 'macOS' : boot?.platform === 'win32' ? 'Windows' : 'Linux'
  const shortcutLabel = boot?.platform === 'darwin' ? '⌘ K' : 'Ctrl K'

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const mod = boot?.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        focusSearch()
      } else if (key === 't') {
        event.preventDefault()
        openHome()
      } else if (key === 'w') {
        event.preventDefault()
        if (activeTabId === 'home') closeHome()
        else closeTab(activeTabId)
      } else if (key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
      } else if (key === 'o' && event.shiftKey) {
        event.preventDefault()
        const tab = tabs.find((t) => t.tabId === activeTabId)
        if (tab) {
          void window.aihub.openNative(tab.providerId).catch((error) => showToast(error instanceof Error ? error.message : '打开失败'))
        }
      } else if (key === 'b') {
        event.preventDefault()
        setSidebarCollapsed((value) => !value)
      } else if (/^[1-9]$/.test(key)) {
        const index = Number(key) - 1
        event.preventDefault()
        if (index === 0) {
          openHome()
          return
        }
        const target = tabs[index - 1]
        if (target) setActiveTabId(target.tabId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [boot, tabs, activeTabId, closeTab, closeHome, openHome, focusSearch, showToast])

  const visibleProviders = useMemo(() => {
    if (!settings) return []
    const all = settings.providers.filter((p) => p.enabled)
    if (view === 'favorites') return all.filter((p) => settings.favorites.includes(p.id))
    if (view === 'recent') {
      return settings.recent
        .map((id) => all.find((p) => p.id === id))
        .filter((p): p is Provider => Boolean(p))
    }
    return all
  }, [settings, view])

  const filteredProviders = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return visibleProviders
    if (isUrlLike(term)) return []
    return visibleProviders.filter((p) => p.name.toLowerCase().includes(term))
  }, [visibleProviders, query])

  const activeProviders = useMemo(() => {
    if (!settings) return []
    return tabs
      .map((tab) => settings.providers.find((p) => p.id === tab.providerId))
      .filter((p): p is Provider => Boolean(p))
  }, [tabs, settings])

  if (!ready || !settings || !boot) {
    return (
      <div className="app-loading">
        <div className="logo">
          <img src={appIcon} alt="" />
        </div>
        <span>正在启动 AiHub…</span>
      </div>
    )
  }

  return (
    <div className={`app${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar
        tabs={tabs}
        titles={titles}
        activeTabId={activeTabId}
        providers={settings.providers}
        sync={sync}
        view={view}
        collapsed={sidebarCollapsed}
        homeOpen={homeOpen}
        onSelectTab={(tabId) => setActiveTabId(tabId)}
        onCloseTab={closeTab}
        onCloseHome={closeHome}
        onHome={openHome}
        onNew={focusSearch}
        onView={(next) => {
          setHomeOpen(true)
          setView(next)
          setActiveTabId('home')
          setQuery('')
        }}
        onSettings={() => setSettingsOpen(true)}
        onHelp={() => showToast('Ctrl/Cmd+K 搜索 · Ctrl/Cmd+B 折叠侧栏 · Ctrl/Cmd+W 关闭标签 · Ctrl/Cmd+1 回首页')}
        onFocusSearch={focusSearch}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="shell">
        <TopTabs
          tabs={tabs}
          titles={titles}
          activeTabId={activeTabId}
          providers={settings.providers}
          homeOpen={homeOpen}
          onSelect={(tabId) => setActiveTabId(tabId)}
          onClose={closeTab}
          onCloseHome={closeHome}
          onHome={openHome}
          onNew={focusSearch}
        />

        <div className="workspace" style={{ display: activeTabId === 'home' ? 'none' : 'flex' }}>
          {tabs.map((tab) => {
            const provider = activeProviders.find((p) => p.id === tab.providerId)
            if (!provider || !loaded.has(tab.tabId)) return null
            return (
              <ProviderView
                key={tab.tabId}
                provider={provider}
                active={tab.tabId === activeTabId}
                onTitle={(title) => setTitles((prev) => ({ ...prev, [tab.tabId]: title }))}
                onToast={showToast}
              />
            )
          })}
        </div>

        {activeTabId === 'home' ? (
          <Home
            view={view}
            providers={filteredProviders}
            favorites={settings.favorites}
            query={query}
            sync={sync}
            shortcutLabel={shortcutLabel}
            onQuery={setQuery}
            onSubmit={handleSubmit}
            onOpen={openProvider}
            onOpenUrl={(url) => { void openUrl(url) }}
            onToggleFavorite={toggleFavorite}
            onEdit={(provider) => setEditingProvider(provider)}
            onDelete={(provider) => setDeletingProvider(provider)}
            onAdd={() => setAddOpen(true)}
          />
        ) : null}
      </div>

      {settingsOpen ? (
        <SettingsDrawer
          settings={settings}
          sync={sync}
          version={boot.version}
          platform={platformLabel}
          onUpdate={(patch) => { void updateSettings(patch) }}
          onClose={() => setSettingsOpen(false)}
          onRerunOnboarding={() => { void rerunOnboarding() }}
          onUnlink={() => { void unlinkBrowser() }}
          onSyncNow={() => { void syncNow() }}
          onOpenExtensionFolder={() => { void openExtensionFolder() }}
          onOpenExtensionsPage={() => { void openExtensionsPage() }}
        />
      ) : null}

      {onboardingOpen ? (
        <Onboarding
          browsers={browsers}
          sync={sync}
          onSkip={skipOnboarding}
          onLink={linkBrowser}
          onPick={() => window.aihub.pickBrowser()}
        />
      ) : null}

      {addOpen || editingProvider ? (
        <AddProviderDialog
          key={editingProvider?.id ?? 'new-provider'}
          provider={editingProvider ?? undefined}
          onClose={() => {
            setAddOpen(false)
            setEditingProvider(null)
          }}
          onSave={(provider) => { void saveProvider(provider) }}
        />
      ) : null}

      {deletingProvider ? (
        <ConfirmDialog
          title="删除应用"
          message={`确定删除「${deletingProvider.name}」吗？如果它正在标签页中打开，也会一并关闭。`}
          onCancel={() => setDeletingProvider(null)}
          onConfirm={() => { if (deletingProvider) void deleteProvider(deletingProvider) }}
        />
      ) : null}

      <Toast message={toast} />
    </div>
  )
}
