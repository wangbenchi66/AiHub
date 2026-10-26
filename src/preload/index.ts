import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AiHubApi,
  BridgeInfo,
  BrowserBinding,
  BrowserInfo,
  Bootstrap,
  Provider,
  Settings,
  SiteStorage,
  SyncPolicy,
  SyncStatus,
  TabState
} from '@shared/types'

const api: AiHubApi = {
  bootstrap: (): Promise<Bootstrap> => ipcRenderer.invoke(IPC.bootstrap),
  updateSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.updateSettings, patch),
  saveProviders: (providers: Provider[]): Promise<Provider[]> =>
    ipcRenderer.invoke(IPC.saveProviders, providers),
  detectBrowsers: (): Promise<BrowserInfo[]> => ipcRenderer.invoke(IPC.detectBrowsers),
  pickBrowser: (): Promise<BrowserInfo | null> => ipcRenderer.invoke(IPC.pickBrowser),
  linkBrowser: (binding: BrowserBinding, policy?: SyncPolicy): Promise<SyncStatus> =>
    ipcRenderer.invoke(IPC.linkBrowser, binding, policy),
  unlinkBrowser: (): Promise<SyncStatus> => ipcRenderer.invoke(IPC.unlinkBrowser),
  syncStatus: (): Promise<SyncStatus> => ipcRenderer.invoke(IPC.syncStatus),
  syncNow: (): Promise<SyncStatus> => ipcRenderer.invoke(IPC.syncNow),
  bridgeInfo: (): Promise<BridgeInfo> => ipcRenderer.invoke(IPC.bridgeInfo),
  openExtensionFolder: (): Promise<void> => ipcRenderer.invoke(IPC.openExtensionFolder),
  openExtensionsPage: (target?: { id: string; exe: string; profileDir?: string }): Promise<'extension' | 'browser'> =>
    ipcRenderer.invoke(IPC.openExtensionsPage, target),
  onSyncChanged: (callback: (status: SyncStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: SyncStatus): void => callback(status)
    ipcRenderer.on(IPC.syncChanged, listener)
    return () => ipcRenderer.removeListener(IPC.syncChanged, listener)
  },
  openNative: (providerId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.openNative, providerId),
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC.openExternal, url),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.openPath, path),
  storageGet: (origin: string): Promise<SiteStorage | null> =>
    ipcRenderer.invoke(IPC.storageGet, origin),
  saveTabs: (tabs: TabState[], activeTabId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.saveTabs, tabs, activeTabId)
}

contextBridge.exposeInMainWorld('aihub', api)
