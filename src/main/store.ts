import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRESET_PROVIDERS } from '@shared/providers'
import type { Settings } from '@shared/types'

const DEFAULT_KEEP_ALIVE = 6

export function defaultSettings(): Settings {
  return {
    version: 2,
    theme: 'system',
    keepAlive: DEFAULT_KEEP_ALIVE,
    onboardingCompleted: false,
    providers: PRESET_PROVIDERS.map((p) => ({ ...p })),
    favorites: [],
    recent: [],
    tabs: { activeTabId: 'home', open: [] },
    sync: {
      enabled: false,
      browser: null,
      conflict: 'browser'
    }
  }
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function mergeSettings(raw: Partial<Settings> | null): Settings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base

  const providers = Array.isArray(raw.providers) && raw.providers.length > 0
    ? raw.providers
    : base.providers

  const merged: Settings = {
    ...base,
    ...raw,
    providers,
    favorites: Array.isArray(raw.favorites) ? raw.favorites : base.favorites,
    recent: Array.isArray(raw.recent) ? raw.recent.slice(0, 20) : base.recent,
    tabs: {
      ...base.tabs,
      ...(raw.tabs ?? {})
    },
    sync: {
      ...base.sync,
      ...(raw.sync ?? {})
    }
  }

  merged.keepAlive = Math.min(12, Math.max(2, Number(merged.keepAlive) || DEFAULT_KEEP_ALIVE))
  merged.theme = merged.theme === 'light' || merged.theme === 'dark' ? merged.theme : 'system'
  merged.version = 2
  return merged
}

export function loadSettings(): Settings {
  const path = configPath()
  try {
    if (!existsSync(path)) return defaultSettings()
    const raw = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) as Partial<Settings>
    return mergeSettings(raw)
  } catch {
    try {
      const backup = `${path}.broken-${Date.now()}`
      if (existsSync(path)) renameSync(path, backup)
    } catch {
      // ignore
    }
    return defaultSettings()
  }
}

export function saveSettings(settings: Settings): Settings {
  const path = configPath()
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  renameSync(tmp, path)
  return settings
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = loadSettings()
  const next = mergeSettings({
    ...current,
    ...patch,
    tabs: patch.tabs ? { ...current.tabs, ...patch.tabs } : current.tabs,
    sync: patch.sync ? { ...current.sync, ...patch.sync } : current.sync
  })
  return saveSettings(next)
}
