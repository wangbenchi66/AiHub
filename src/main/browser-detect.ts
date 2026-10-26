import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { spawn } from 'node:child_process'
import type { BrowserBinding, BrowserInfo, ProfileInfo } from '@shared/types'

const execFileAsync = promisify(execFile)

interface BrowserDef {
  id: string
  label: string
  family: 'chromium' | 'firefox' | 'safari'
  winExe: string[]
  macExe: string[]
  winData: string[]
  macData: string[]
  winProcs: string[]
  macProcs: string[]
  supported: boolean
  note?: string
}

const APP_DATA = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
const LOCAL_APP_DATA = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
const PROGRAM_FILES = process.env.PROGRAMFILES ?? 'C:\\Program Files'
const PROGRAM_FILES_X86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)'
const HOME = homedir()

const DEFS: BrowserDef[] = [
  {
    id: 'chrome',
    label: 'Google Chrome',
    family: 'chromium',
    winExe: [
      join(PROGRAM_FILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(PROGRAM_FILES_X86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(LOCAL_APP_DATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
    ],
    macExe: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(HOME, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
    ],
    winData: [join(LOCAL_APP_DATA, 'Google', 'Chrome', 'User Data')],
    macData: [join(HOME, 'Library', 'Application Support', 'Google', 'Chrome')],
    winProcs: ['chrome.exe'],
    macProcs: ['Google Chrome'],
    supported: true
  },
  {
    id: 'edge',
    label: 'Microsoft Edge',
    family: 'chromium',
    winExe: [
      join(PROGRAM_FILES_X86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(PROGRAM_FILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(LOCAL_APP_DATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ],
    macExe: [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      join(HOME, 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')
    ],
    winData: [join(LOCAL_APP_DATA, 'Microsoft', 'Edge', 'User Data')],
    macData: [join(HOME, 'Library', 'Application Support', 'Microsoft Edge')],
    winProcs: ['msedge.exe'],
    macProcs: ['Microsoft Edge'],
    supported: true
  },
  {
    id: 'brave',
    label: 'Brave',
    family: 'chromium',
    winExe: [
      join(PROGRAM_FILES, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      join(LOCAL_APP_DATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
    ],
    macExe: [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      join(HOME, 'Applications', 'Brave Browser.app', 'Contents', 'MacOS', 'Brave Browser')
    ],
    winData: [join(LOCAL_APP_DATA, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    macData: [join(HOME, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')],
    winProcs: ['brave.exe'],
    macProcs: ['Brave Browser'],
    supported: true
  },
  {
    id: 'vivaldi',
    label: 'Vivaldi',
    family: 'chromium',
    winExe: [
      join(LOCAL_APP_DATA, 'Vivaldi', 'Application', 'vivaldi.exe'),
      join(PROGRAM_FILES, 'Vivaldi', 'Application', 'vivaldi.exe')
    ],
    macExe: [
      '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
      join(HOME, 'Applications', 'Vivaldi.app', 'Contents', 'MacOS', 'Vivaldi')
    ],
    winData: [join(LOCAL_APP_DATA, 'Vivaldi', 'User Data')],
    macData: [join(HOME, 'Library', 'Application Support', 'Vivaldi')],
    winProcs: ['vivaldi.exe'],
    macProcs: ['Vivaldi'],
    supported: true
  },
  {
    id: 'opera',
    label: 'Opera',
    family: 'chromium',
    winExe: [
      join(LOCAL_APP_DATA, 'Programs', 'Opera', 'opera.exe'),
      join(PROGRAM_FILES, 'Opera', 'opera.exe')
    ],
    macExe: [
      '/Applications/Opera.app/Contents/MacOS/Opera',
      join(HOME, 'Applications', 'Opera.app', 'Contents', 'MacOS', 'Opera')
    ],
    winData: [join(APP_DATA, 'Opera Software', 'Opera Stable')],
    macData: [join(HOME, 'Library', 'Application Support', 'com.operasoftware.Opera')],
    winProcs: ['opera.exe'],
    macProcs: ['Opera'],
    supported: true
  },
  {
    id: 'firefox',
    label: 'Firefox',
    family: 'firefox',
    winExe: [
      join(PROGRAM_FILES, 'Mozilla Firefox', 'firefox.exe'),
      join(PROGRAM_FILES_X86, 'Mozilla Firefox', 'firefox.exe')
    ],
    macExe: ['/Applications/Firefox.app/Contents/MacOS/firefox'],
    winData: [join(APP_DATA, 'Mozilla', 'Firefox', 'Profiles')],
    macData: [join(HOME, 'Library', 'Application Support', 'Firefox', 'Profiles')],
    winProcs: ['firefox.exe'],
    macProcs: ['firefox'],
    supported: false,
    note: 'Firefox 需要单独的扩展包，v1.1 支持'
  },
  {
    id: 'safari',
    label: 'Safari',
    family: 'safari',
    winExe: [],
    macExe: ['/Applications/Safari.app/Contents/MacOS/Safari'],
    winData: [],
    macData: [join(HOME, 'Library', 'Safari')],
    winProcs: [],
    macProcs: ['Safari'],
    supported: false,
    note: 'Safari 需要独立的 Safari Web Extension，v2 支持'
  }
]

function existing(paths: string[]): string | undefined {
  return paths.find((p) => p && existsSync(p))
}

export function readProfiles(userDataDir: string): ProfileInfo[] {
  const localState = join(userDataDir, 'Local State')
  try {
    if (!existsSync(localState)) return []
    const raw = JSON.parse(readFileSync(localState, 'utf8')) as {
      profile?: { info_cache?: Record<string, { name?: string; last_used?: number }> }
    }
    const cache = raw.profile?.info_cache
    if (!cache) return []
    return Object.entries(cache)
      .map(([dir, info]) => ({
        dir,
        name: info.name || dir,
        lastUsed: info.last_used
      }))
      .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
  } catch {
    return []
  }
}

/**
 * macOS Chrome/Edge can have a readable profile directory but an unreadable or
 * missing Local State (first launch, Full Disk Access, locked file). Fall back
 * to the actual profile folders so the wizard is not stuck on “下一步”.
 */
function scanProfileFolders(userDataDir: string): ProfileInfo[] {
  try {
    return readdirSync(userDataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (entry.name === 'Default' || /^Profile \d+$/.test(entry.name)))
      .map((entry) => ({ dir: entry.name, name: entry.name }))
  } catch {
    return []
  }
}

async function isRunning(proc: string): Promise<boolean> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${proc}`, '/NH'], {
        timeout: 3000,
        windowsHide: true
      })
      return stdout.toLowerCase().includes(proc.toLowerCase())
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync('pgrep', ['-x', proc], { timeout: 3000 })
      return stdout.trim().length > 0
    }
  } catch {
    return false
  }
  return false
}

export async function detectBrowsers(): Promise<BrowserInfo[]> {
  const result: BrowserInfo[] = []
  for (const def of DEFS) {
    const exe = existing(process.platform === 'darwin' ? def.macExe : def.winExe)
    if (!exe) continue
    const userDataDir = existing(process.platform === 'darwin' ? def.macData : def.winData) ?? ''
    let profiles = userDataDir ? readProfiles(userDataDir) : []
    if (!profiles.length && def.family === 'chromium') {
      profiles = userDataDir ? scanProfileFolders(userDataDir) : []
      if (!profiles.length) profiles = [{ dir: 'Default', name: 'Default' }]
    }
    let running = false
    for (const proc of process.platform === 'darwin' ? def.macProcs : def.winProcs) {
      if (await isRunning(proc)) {
        running = true
        break
      }
    }
    result.push({
      id: def.id,
      label: def.label,
      family: def.family,
      exe,
      userDataDir,
      running,
      profiles,
      supported: def.supported,
      note: def.note
    })
  }
  return result
}

export function launchNative(binding: BrowserBinding, url: string): void {
  if (!/^https?:\/\//i.test(url)) return
  const args = binding.profileDir
    ? [`--profile-directory=${binding.profileDir}`, `--app=${url}`]
    : [`--app=${url}`]
  const child = spawn(binding.exe, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

export function guessLabelFromExe(exe: string): string {
  const name = basename(exe).replace(/\.exe$/i, '')
  return name || '自定义浏览器'
}

export function guessUserDataFromExe(exe: string): string {
  const lower = exe.toLowerCase()
  if (process.platform === 'darwin') {
    if (lower.includes('google chrome')) return join(HOME, 'Library', 'Application Support', 'Google', 'Chrome')
    if (lower.includes('microsoft edge')) return join(HOME, 'Library', 'Application Support', 'Microsoft Edge')
    if (lower.includes('brave')) return join(HOME, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')
    if (lower.includes('vivaldi')) return join(HOME, 'Library', 'Application Support', 'Vivaldi')
    if (lower.includes('opera')) return join(HOME, 'Library', 'Application Support', 'com.operasoftware.Opera')
    return ''
  }
  if (lower.includes('chrome')) return join(LOCAL_APP_DATA, 'Google', 'Chrome', 'User Data')
  if (lower.includes('msedge')) return join(LOCAL_APP_DATA, 'Microsoft', 'Edge', 'User Data')
  if (lower.includes('brave')) return join(LOCAL_APP_DATA, 'BraveSoftware', 'Brave-Browser', 'User Data')
  if (lower.includes('vivaldi')) return join(LOCAL_APP_DATA, 'Vivaldi', 'User Data')
  if (lower.includes('opera')) return join(APP_DATA, 'Opera Software', 'Opera Stable')
  return ''
}

export function executableName(exe: string): string {
  return process.platform === 'darwin' ? basename(exe) : basename(exe)
}

export function parentDir(path: string): string {
  return dirname(path)
}

export function firstMacBinary(appPath: string): string | undefined {
  try {
    const macos = join(appPath, 'Contents', 'MacOS')
    const files = readdirSync(macos)
    return files[0] ? join(macos, files[0]) : undefined
  } catch {
    return undefined
  }
}
