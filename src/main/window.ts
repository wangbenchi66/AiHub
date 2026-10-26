import { app, BrowserWindow, Menu, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const PARTITION = 'persist:aihub'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    title: 'AiHub',
    backgroundColor: '#F7F7F8',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true
    }
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.setTitle('AiHub')

  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    if (params.partition !== PARTITION) {
      event.preventDefault()
      return
    }
    if (params.src && !/^https?:\/\//i.test(params.src)) {
      event.preventDefault()
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
  }

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const screenshotPath = process.env.AIHUB_SCREENSHOT
  if (screenshotPath) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const step = Number(process.env.AIHUB_SCREENSHOT_STEP ?? '0')
          if (step >= 2) {
            await win.webContents.executeJavaScript(
              `document.querySelector('.onboarding-actions .btn.primary')?.click()`
            )
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          if (step >= 3) {
            await win.webContents.executeJavaScript(
              `document.querySelector('.onboarding-actions .btn.primary')?.click()`
            )
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          const image = await win.webContents.capturePage()
          const target = screenshotPath === '1' ? join(process.cwd(), 'docs', 'screenshots', 'home.png') : screenshotPath
          const dir = dirname(target)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(target, image.toPNG())
          console.log(`[aihub] screenshot written: ${target}`)
        } catch (error) {
          console.error('[aihub] screenshot failed', error)
        } finally {
          app.quit()
        }
      }, Number(process.env.AIHUB_SCREENSHOT_DELAY ?? '1600'))
    })
  }

  return win
}
