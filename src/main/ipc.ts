import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { BRIDGE_EXTENSION_ID, BRIDGE_PORTS } from '@shared/bridge'
import type {
  Bootstrap,
  BridgeInfo,
  BrowserBinding,
  BrowserInfo,
  Provider,
  Settings,
  SiteStorage,
  SyncPolicy,
  SyncStatus,
  TabState
} from '@shared/types'
import { loadSettings, saveSettings, updateSettings } from './store'
import { appVersion } from './version'
import {
  detectBrowsers,
  firstMacBinary,
  guessLabelFromExe,
  guessUserDataFromExe,
  launchNative,
  readProfiles
} from './browser-detect'
import type { SyncEngine } from './bridge/sync-engine'
import type { BridgeServer } from './bridge/server'

function assertHttp(url: string): void {
  if (!/^https?:\/\//i.test(url)) throw new Error('只允许打开 http/https 链接')
}

function extensionSource(): string {
  if (!app.isPackaged) {
    const dev = join(process.cwd(), 'resources', 'browser-bridge')
    if (existsSync(dev)) return dev
  }
  const bundled = join(process.resourcesPath, 'browser-bridge')
  if (existsSync(bundled)) return bundled
  return join(app.getAppPath(), 'resources', 'browser-bridge')
}

function extensionPath(): string {
  const source = extensionSource()
  const target = join(app.getPath('userData'), 'bridge-extension')
  const marker = join(target, '.aihub-version')
  try {
    const sourceStamp = [
      appVersion(),
      statSync(join(source, 'manifest.json')).mtimeMs,
      statSync(join(source, 'background.js')).mtimeMs
    ].join(':')
    const markerVersion = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : ''
    if (!existsSync(join(target, 'manifest.json')) || markerVersion !== sourceStamp) {
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      cpSync(source, target, { recursive: true })
      writeFileSync(marker, sourceStamp, 'utf8')
    }
    return target
  } catch {
    return source
  }
}

function extensionsUrl(browserId: string): string {
  if (browserId === 'edge') return 'edge://extensions'
  if (browserId === 'opera') return 'opera://extensions'
  return 'chrome://extensions'
}

export function registerIpc(engine: SyncEngine, bridge: BridgeServer): void {
  ipcMain.handle(IPC.bootstrap, async (): Promise<Bootstrap> => {
    const settings = loadSettings()
    const browsers = await detectBrowsers()
    return {
      version: appVersion(),
      platform: process.platform as Bootstrap['platform'],
      settings,
      browsers,
      sync: engine.status()
    }
  })

  ipcMain.handle(IPC.updateSettings, (_event, patch: Partial<Settings>): Settings => {
    return updateSettings(patch)
  })

  ipcMain.handle(IPC.saveProviders, (_event, providers: Provider[]): Provider[] => {
    if (!Array.isArray(providers)) throw new Error('invalid providers')
    const settings = loadSettings()
    settings.providers = providers
    saveSettings(settings)
    return settings.providers
  })

  ipcMain.handle(IPC.detectBrowsers, async (): Promise<BrowserInfo[]> => {
    return detectBrowsers()
  })

  ipcMain.handle(IPC.pickBrowser, async (): Promise<BrowserInfo | null> => {
    const parent = BrowserWindow.getFocusedWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择浏览器可执行文件',
      properties: process.platform === 'darwin'
        ? ['openFile', 'openDirectory']
        : ['openFile'],
      filters: process.platform === 'darwin'
        ? undefined
        : [{ name: '浏览器可执行文件', extensions: ['exe'] }]
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null

    let exe = result.filePaths[0]
    if (process.platform === 'darwin' && exe.endsWith('.app')) {
      exe = firstMacBinary(exe) ?? exe
    }
    if (!existsSync(exe)) throw new Error('文件不存在')

    const userDataDir = guessUserDataFromExe(exe)
    const profiles = userDataDir && existsSync(userDataDir) ? readProfiles(userDataDir) : []
    return {
      id: 'custom',
      label: guessLabelFromExe(exe),
      family: 'chromium',
      exe,
      userDataDir,
      running: false,
      profiles:
        profiles.length > 0
          ? profiles
          : [{ dir: 'Default', name: '默认（未检测到 Profile）' }],
      supported: true,
      note: '手动选择的浏览器'
    }
  })

  ipcMain.handle(IPC.linkBrowser, (
    _event,
    binding: BrowserBinding,
    policy?: SyncPolicy
  ): SyncStatus => {
    if (!binding?.exe || !existsSync(binding.exe)) {
      throw new Error('找不到浏览器可执行文件')
    }
    const settings = loadSettings()
    settings.sync = {
      ...settings.sync,
      enabled: true,
      conflict: policy?.conflict === 'app' ? 'app' : policy?.conflict === 'browser'
        ? 'browser'
        : settings.sync.conflict,
      browser: {
        id: binding.id,
        label: binding.label,
        exe: binding.exe,
        userDataDir: binding.userDataDir,
        profileDir: binding.profileDir,
        profileName: binding.profileName
      }
    }
    settings.onboardingCompleted = true
    saveSettings(settings)
    engine.requestFullSync()
    return engine.status()
  })

  ipcMain.handle(IPC.unlinkBrowser, (): SyncStatus => {
    const settings = loadSettings()
    settings.sync = {
      ...settings.sync,
      enabled: false,
      browser: null
    }
    saveSettings(settings)
    return engine.status()
  })

  ipcMain.handle(IPC.syncStatus, (): SyncStatus => engine.status())

  ipcMain.handle(IPC.syncNow, (): SyncStatus => engine.requestFullSync())

  ipcMain.handle(IPC.bridgeInfo, (): BridgeInfo => ({
    extensionId: BRIDGE_EXTENSION_ID,
    extensionPath: extensionPath(),
    ports: BRIDGE_PORTS,
    port: bridge.port,
    session: engine.sessionId()
  }))

  ipcMain.handle(IPC.openExtensionFolder, async (): Promise<void> => {
    const path = extensionPath()
    if (!existsSync(path)) throw new Error('找不到 Bridge 扩展目录')
    const error = await shell.openPath(path)
    if (error) throw new Error(error)
  })

  ipcMain.handle(IPC.openExtensionsPage, async (
    _event,
    target?: { id: string; exe: string; profileDir?: string }
  ): Promise<void> => {
    let browser = target ?? null
    if (!browser) {
      const settings = loadSettings()
      browser = settings.sync.browser
    }
    if (!browser) throw new Error('还没有链接浏览器')
    const args: string[] = []
    if (browser.profileDir) args.push(`--profile-directory=${browser.profileDir}`)
    args.push(extensionsUrl(browser.id))
    const child = spawn(browser.exe, args, {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
  })

  ipcMain.handle(IPC.openNative, async (_event, providerId: string): Promise<void> => {
    const settings = loadSettings()
    const browser = settings.sync.browser
    if (!browser) throw new Error('还没有链接浏览器')
    const provider = settings.providers.find((p) => p.id === providerId)
    if (!provider) throw new Error('找不到该站点')
    assertHttp(provider.url)
    launchNative(browser, provider.url)
  })

  ipcMain.handle(IPC.openExternal, async (_event, url: string): Promise<void> => {
    assertHttp(url)
    await shell.openExternal(url)
  })

  ipcMain.handle(IPC.openPath, async (_event, path: string): Promise<void> => {
    if (!path) return
    await shell.openPath(path)
  })

  ipcMain.handle(IPC.storageGet, (_event, origin: string): SiteStorage | null => {
    if (typeof origin !== 'string') return null
    return engine.getSiteStorage(origin)
  })

  ipcMain.handle(IPC.saveTabs, (_event, tabs: TabState[], activeTabId: string): void => {
    if (!Array.isArray(tabs)) return
    const settings = loadSettings()
    settings.tabs = {
      activeTabId: typeof activeTabId === 'string' ? activeTabId : 'home',
      open: tabs
        .filter((t) => t && typeof t.tabId === 'string' && typeof t.providerId === 'string')
        .slice(0, 40)
    }
    saveSettings(settings)
  })
}
