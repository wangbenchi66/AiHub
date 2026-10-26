import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc'
import { registerIpc } from './ipc'
import { createMainWindow } from './window'
import { loadSettings } from './store'
import { SyncEngine } from './bridge/sync-engine'
import { BridgeServer } from './bridge/server'
import { appVersion } from './version'
import { chromeUserAgent } from './user-agent'

if (process.env.AIHUB_USER_DATA) {
  app.setPath('userData', process.env.AIHUB_USER_DATA)
}

app.setName('AiHub')
app.userAgentFallback = chromeUserAgent()
if (process.platform === 'win32') {
  app.setAppUserModelId('com.aihub.desktop')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  let engine: SyncEngine | null = null
  let bridge: BridgeServer | null = null

  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    session
      .fromPartition('persist:aihub')
      .setUserAgent(chromeUserAgent(), 'zh-CN,zh;q=0.9,en;q=0.8')

    engine = new SyncEngine(loadSettings, (status) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.syncChanged, status)
      }
    })
    engine.start()

    bridge = new BridgeServer(engine, appVersion())
    registerIpc(engine, bridge)
    try {
      await bridge.start()
    } catch (error) {
      console.error('[bridge] start failed', error)
    }

    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('before-quit', () => {
    engine?.stop()
    bridge?.stop()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return

  contents.setWindowOpenHandler(({ url }) => {
    if (!/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        backgroundColor: '#F7F7F8',
        webPreferences: {
          partition: 'persist:aihub',
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      }
    }
  })
})
