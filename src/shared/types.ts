export type Theme = 'system' | 'light' | 'dark'

export type Platform = 'win32' | 'darwin' | 'linux'

export type ProviderGroup = '对话' | '搜索' | '工具' | '平台'

export interface Provider {
  id: string
  name: string
  url: string
  icon: string
  color: string
  group: ProviderGroup
  enabled: boolean
  custom?: boolean
  pinned?: boolean
}

export interface ProfileInfo {
  dir: string
  name: string
  lastUsed?: number
}

export type BrowserFamily = 'chromium' | 'firefox' | 'safari'

export interface BrowserInfo {
  id: string
  label: string
  family: BrowserFamily
  exe: string
  userDataDir: string
  version?: string
  running: boolean
  profiles: ProfileInfo[]
  supported: boolean
  note?: string
}

export interface BrowserBinding {
  id: string
  label: string
  exe: string
  userDataDir: string
  profileDir: string
  profileName: string
}

export interface SyncSettings {
  enabled: boolean
  browser: BrowserBinding | null
  conflict: 'browser' | 'app'
}

export type SyncState =
  | 'disabled'
  | 'waiting'
  | 'connected'
  | 'browser-missing'
  | 'coming-soon'

export interface SyncStatus {
  enabled: boolean
  state: SyncState
  connected: boolean
  browser: BrowserBinding | null
  port?: number
  lastSyncAt?: number
  applied?: number
  conflicts?: number
  error?: string
}

export interface BridgeCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
  expirationDate?: number
  session: boolean
  hostOnly: boolean
  partitionKey?: unknown
}

export interface SyncOp {
  op: 'set' | 'remove'
  key: string
  cookie: BridgeCookie
  hash?: string
}

export interface SyncPolicy {
  conflict: 'browser' | 'app'
}

export interface BridgeInfo {
  extensionId: string
  extensionPath: string
  ports: number[]
  port: number
  session: string
}

export interface SiteStorage {
  local: Record<string, string>
  session: Record<string, string>
}

export interface TabState {
  tabId: string
  providerId: string
}

export interface TabSettings {
  activeTabId: string
  open: TabState[]
}

export interface Settings {
  version: number
  theme: Theme
  keepAlive: number
  onboardingCompleted: boolean
  providers: Provider[]
  favorites: string[]
  recent: string[]
  tabs: TabSettings
  sync: SyncSettings
}

export interface Bootstrap {
  version: string
  platform: Platform
  settings: Settings
  browsers: BrowserInfo[]
  sync: SyncStatus
}

export interface AiHubApi {
  bootstrap: () => Promise<Bootstrap>
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>
  saveProviders: (providers: Provider[]) => Promise<Provider[]>
  detectBrowsers: () => Promise<BrowserInfo[]>
  pickBrowser: () => Promise<BrowserInfo | null>
  linkBrowser: (binding: BrowserBinding, policy?: SyncPolicy) => Promise<SyncStatus>
  unlinkBrowser: () => Promise<SyncStatus>
  syncStatus: () => Promise<SyncStatus>
  syncNow: () => Promise<SyncStatus>
  bridgeInfo: () => Promise<BridgeInfo>
  openExtensionFolder: () => Promise<void>
  openExtensionsPage: (target?: { id: string; exe: string; profileDir?: string }) => Promise<'extension' | 'browser'>
  onSyncChanged: (callback: (status: SyncStatus) => void) => () => void
  openNative: (providerId: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  openPath: (path: string) => Promise<void>
  storageGet: (origin: string) => Promise<SiteStorage | null>
  saveTabs: (tabs: TabState[], activeTabId: string) => Promise<void>
}
