import { app, session } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  BridgeCookie,
  Settings,
  SiteStorage,
  SyncOp,
  SyncStatus
} from '@shared/types'
import {
  cookieKey,
  cookieUrl,
  fromElectronCookie,
  hashCookie,
  mergeCookies,
  toElectronDetails,
  type CookieMap
} from './merge'

interface QueuedEvent {
  seq: number
  op: 'set' | 'remove'
  cookie: BridgeCookie
  hash?: string
}

interface PollResult {
  session: string
  cursor: number
  reset: boolean
  fullSync: boolean
  events: QueuedEvent[]
}

interface PendingSync {
  ops: SyncOp[]
  createdAt: number
}

interface PendingEvent {
  key: string
  op: 'set' | 'remove'
  hash?: string
}

const SESSION_ID = randomUUID()

function statePath(): string {
  return join(app.getPath('userData'), 'sync-state.json')
}

function siteStoragePath(): string {
  return join(app.getPath('userData'), 'site-storage.json')
}

export class SyncEngine {
  private readonly ses = session.fromPartition('persist:aihub')
  private state = new Map<string, string>()
  private siteStorage = new Map<string, SiteStorage>()
  private pendingSyncs = new Map<string, PendingSync>()
  private pendingEvents = new Map<number, PendingEvent>()
  private queue: QueuedEvent[] = []
  private waiters: Array<() => void> = []
  private seq = 0
  private port = 0
  private lastSeen = 0
  private lastSyncAt = 0
  private applied = 0
  private conflicts = 0
  private error = ''
  private fullSyncRequested = false
  private resetRequested = false
  private listenerAttached = false
  private timer: NodeJS.Timeout | null = null
  private suppress = new Map<string, number>()
  private suppressRemove = new Map<string, number>()
  private lastState: string = ''

  constructor(
    private readonly getSettings: () => Settings,
    private readonly onStatus: (status: SyncStatus) => void
  ) {}

  start(): void {
    this.loadState()
    this.loadSiteStorage()
    if (!this.listenerAttached) {
      this.ses.cookies.on('changed', this.handleCookieChanged)
      this.listenerAttached = true
    }
    this.timer = setInterval(() => this.emitStatus(), 5000)
    this.emitStatus()
  }

  stop(): void {
    if (this.listenerAttached) {
      this.ses.cookies.removeListener('changed', this.handleCookieChanged)
      this.listenerAttached = false
    }
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const wake of this.waiters) wake()
    this.waiters = []
  }

  setPort(port: number): void {
    this.port = port
    this.emitStatus()
  }

  touch(): void {
    this.lastSeen = Date.now()
    this.emitStatus()
  }

  status(): SyncStatus {
    const settings = this.getSettings()
    const browser = settings.sync.browser
    const connected = Date.now() - this.lastSeen < 45_000
    let state: SyncStatus['state'] = 'disabled'
    if (browser) {
      if (!existsSync(browser.exe)) state = 'browser-missing'
      else if (connected) state = 'connected'
      else state = 'waiting'
    }
    return {
      enabled: Boolean(browser && settings.sync.enabled),
      state,
      connected,
      browser,
      port: this.port,
      lastSyncAt: this.lastSyncAt || undefined,
      applied: this.applied,
      conflicts: this.conflicts,
      error: this.error || undefined
    }
  }

  requestFullSync(): SyncStatus {
    this.fullSyncRequested = true
    this.resetRequested = true
    this.wake()
    this.emitStatus()
    return this.status()
  }

  isLinked(): boolean {
    const sync = this.getSettings().sync
    return Boolean(sync.enabled && sync.browser)
  }

  sessionId(): string {
    return SESSION_ID
  }

  private emitStatus(): void {
    const status = this.status()
    const serialized = JSON.stringify(status)
    if (serialized === this.lastState) return
    this.lastState = serialized
    this.onStatus(status)
  }

  private loadState(): void {
    try {
      const path = statePath()
      if (!existsSync(path)) return
      const raw = JSON.parse(readFileSync(path, 'utf8')) as {
        version?: number
        entries?: Record<string, string>
      }
      if (raw.entries && typeof raw.entries === 'object') {
        this.state = new Map(Object.entries(raw.entries))
      }
    } catch {
      this.state = new Map()
    }
  }

  private saveState(): void {
    try {
      const dir = app.getPath('userData')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const path = statePath()
      const tmp = `${path}.tmp`
      writeFileSync(
        tmp,
        JSON.stringify({ version: 1, entries: Object.fromEntries(this.state) }, null, 2),
        'utf8'
      )
      renameSync(tmp, path)
    } catch (error) {
      this.error = error instanceof Error ? error.message : '同步状态保存失败'
    }
  }

  private loadSiteStorage(): void {
    try {
      const path = siteStoragePath()
      if (!existsSync(path)) return
      const raw = JSON.parse(readFileSync(path, 'utf8')) as {
        version?: number
        origins?: Record<string, SiteStorage | Record<string, string>>
      }
      if (!raw.origins || typeof raw.origins !== 'object') return
      for (const [origin, value] of Object.entries(raw.origins)) {
        if (!value || typeof value !== 'object') continue
        const candidate = value as SiteStorage & Record<string, string>
        const hasBuckets = candidate.local !== undefined || candidate.session !== undefined
        const local = hasBuckets ? this.cleanStore(candidate.local) : this.cleanStore(value)
        const session = hasBuckets ? this.cleanStore(candidate.session) : {}
        if (Object.keys(local).length || Object.keys(session).length) {
          this.siteStorage.set(origin, { local, session })
        }
      }
    } catch {
      this.siteStorage = new Map()
    }
  }

  private cleanStore(value: unknown): Record<string, string> {
    const out: Record<string, string> = {}
    if (!value || typeof value !== 'object') return out
    let count = 0
    for (const [key, item] of Object.entries(value)) {
      if (typeof key !== 'string' || typeof item !== 'string') continue
      if (key.length > 256 || item.length > 200_000) continue
      out[key] = item
      count += 1
      if (count >= 500) break
    }
    return out
  }

  private saveSiteStorage(): void {
    try {
      const dir = app.getPath('userData')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      const path = siteStoragePath()
      const tmp = `${path}.tmp`
      writeFileSync(
        tmp,
        JSON.stringify(
          { version: 2, origins: Object.fromEntries(this.siteStorage) },
          null,
          2
        ),
        'utf8'
      )
      renameSync(tmp, path)
    } catch (error) {
      this.error = error instanceof Error ? error.message : '站点存储保存失败'
    }
  }

  getSiteStorage(origin: string): SiteStorage | null {
    const items = this.siteStorage.get(origin)
    return items ? { local: { ...items.local }, session: { ...items.session } } : null
  }

  setSiteStorage(origin: string, local: unknown, session: unknown): void {
    const next: SiteStorage = {
      local: this.cleanStore(local),
      session: this.cleanStore(session)
    }
    if (!Object.keys(next.local).length && !Object.keys(next.session).length) {
      this.siteStorage.delete(origin)
    } else {
      this.siteStorage.set(origin, next)
    }
    this.saveSiteStorage()
  }

  private policy(): 'browser' | 'app' {
    return this.getSettings().sync.conflict === 'app' ? 'app' : 'browser'
  }

  private handleCookieChanged = (
    _event: Electron.Event,
    cookie: Electron.Cookie,
    _cause: string,
    removed: boolean
  ): void => {
    if (!this.isLinked()) return
    const raw = cookie as Electron.Cookie & { partitionKey?: unknown; domain?: string }
    const domain = raw.domain ?? ''
    if (!domain || raw.partitionKey) return
    const normalized = { ...cookie, domain } as Electron.Cookie
    const bridge = fromElectronCookie(normalized)
    const now = Date.now()
    const key = cookieKey(bridge)
    if (removed) {
      const until = this.suppressRemove.get(key) ?? 0
      if (until > now) return
      this.enqueue({ op: 'remove', cookie: bridge })
      return
    }
    const hash = hashCookie(bridge)
    const until = this.suppress.get(hash) ?? 0
    if (until > now) return
    this.enqueue({ op: 'set', cookie: bridge, hash })
  }

  private enqueue(event: Omit<QueuedEvent, 'seq'>): void {
    if (!this.isLinked()) return
    const seq = ++this.seq
    this.queue.push({ ...event, seq })
    this.pendingEvents.set(seq, {
      key: cookieKey(event.cookie),
      op: event.op,
      hash: event.hash
    })
    if (this.queue.length > 1000) {
      this.queue = []
      this.resetRequested = true
    }
    this.wake()
  }

  private wake(): void {
    const waiters = this.waiters
    this.waiters = []
    for (const wake of waiters) wake()
  }

  private prune(): void {
    const now = Date.now()
    for (const [hash, until] of this.suppress) if (until <= now) this.suppress.delete(hash)
    for (const [key, until] of this.suppressRemove) if (until <= now) this.suppressRemove.delete(key)
    for (const [syncId, pending] of this.pendingSyncs) {
      if (now - pending.createdAt > 5 * 60_000) this.pendingSyncs.delete(syncId)
    }
  }

  private async appCookies(): Promise<CookieMap> {
    const map: CookieMap = new Map()
    const cookies = await this.ses.cookies.get({})
    for (const cookie of cookies) {
      const raw = cookie as Electron.Cookie & { partitionKey?: unknown; domain?: string }
      const domain = raw.domain ?? ''
      if (!domain || raw.partitionKey) continue
      const bridge = fromElectronCookie({ ...cookie, domain } as Electron.Cookie)
      map.set(cookieKey(bridge), bridge)
    }
    return map
  }

  private async applyToApp(cookie: BridgeCookie): Promise<boolean> {
    try {
      const hash = hashCookie(cookie)
      this.suppress.set(hash, Date.now() + 3000)
      await this.ses.cookies.set(toElectronDetails(cookie))
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : '写入 Cookie 失败'
      return false
    }
  }

  private async removeFromApp(cookie: BridgeCookie): Promise<boolean> {
    try {
      this.suppressRemove.set(cookieKey(cookie), Date.now() + 3000)
      await this.ses.cookies.remove(cookieUrl(cookie), cookie.name)
      return true
    } catch (error) {
      this.error = error instanceof Error ? error.message : '删除 Cookie 失败'
      return false
    }
  }

  async fullSync(cookies: BridgeCookie[]): Promise<{
    session: string
    syncId?: string
    ops: SyncOp[]
    cursor: number
    appliedToApp: number
    conflicts: number
  }> {
    this.prune()
    const startSeq = this.seq
    const browser: CookieMap = new Map()
    for (const cookie of cookies) {
      if (!cookie || !cookie.domain || cookie.partitionKey) continue
      const normalized: BridgeCookie = {
        ...cookie,
        sameSite: cookie.sameSite || 'unspecified',
        session: Boolean(cookie.session),
        hostOnly: Boolean(cookie.hostOnly),
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly)
      }
      browser.set(cookieKey(normalized), normalized)
    }

    const app = await this.appCookies()
    const result = mergeCookies({
      browser,
      app,
      state: this.state,
      policy: this.policy()
    })

    const nextState = new Map(result.state)
    let applied = 0
    for (const cookie of result.toAppSet) {
      if (await this.applyToApp(cookie)) {
        nextState.set(cookieKey(cookie), hashCookie(cookie))
        applied += 1
      }
    }
    for (const cookie of result.toAppRemove) {
      if (await this.removeFromApp(cookie)) {
        nextState.delete(cookieKey(cookie))
        applied += 1
      }
    }

    this.state = nextState
    this.saveState()
    this.queue = this.queue.filter((event) => event.seq > startSeq)
    this.resetRequested = false
    this.lastSyncAt = Date.now()
    this.applied = applied
    this.conflicts = result.conflicts
    this.error = ''

    const ops = result.toBrowser
    let syncId: string | undefined
    if (ops.length > 0) {
      syncId = randomUUID()
      this.pendingSyncs.set(syncId, { ops, createdAt: Date.now() })
    }
    this.emitStatus()
    return {
      session: SESSION_ID,
      syncId,
      ops,
      cursor: startSeq,
      appliedToApp: applied,
      conflicts: result.conflicts
    }
  }

  ackSync(syncId: string, okKeys: string[], failedKeys: string[]): void {
    const pending = this.pendingSyncs.get(syncId)
    if (!pending) return
    const ok = new Set(okKeys)
    const failed = new Set(failedKeys)
    for (const op of pending.ops) {
      if (!ok.has(op.key) || failed.has(op.key)) continue
      if (op.op === 'set' && op.hash) this.state.set(op.key, op.hash)
      else if (op.op === 'remove') this.state.delete(op.key)
    }
    this.pendingSyncs.delete(syncId)
    this.saveState()
    this.lastSyncAt = Date.now()
    this.applied += ok.size
    this.emitStatus()
  }

  async applyBrowserEvents(
    events: Array<{ op: 'set' | 'remove'; cookie: BridgeCookie }>
  ): Promise<{ applied: number; failed: number }> {
    if (!this.isLinked()) return { applied: 0, failed: 0 }
    let applied = 0
    let failed = 0
    for (const event of events) {
      if (!event?.cookie || !event.cookie.domain) continue
      if (event.op === 'set') {
        const ok = await this.applyToApp(event.cookie)
        if (ok) {
          this.state.set(cookieKey(event.cookie), hashCookie(event.cookie))
          applied += 1
        } else {
          failed += 1
        }
      } else {
        const ok = await this.removeFromApp(event.cookie)
        if (ok) {
          this.state.delete(cookieKey(event.cookie))
          applied += 1
        } else {
          failed += 1
        }
      }
    }
    if (applied > 0) {
      this.saveState()
      this.lastSyncAt = Date.now()
      this.applied += applied
      this.emitStatus()
    }
    return { applied, failed }
  }

  ackEvents(acks: Array<{ seq: number; ok: boolean }>): void {
    let changed = false
    for (const ack of acks) {
      if (!ack.ok) continue
      const pending = this.pendingEvents.get(ack.seq)
      if (!pending) continue
      if (pending.op === 'set' && pending.hash) this.state.set(pending.key, pending.hash)
      else if (pending.op === 'remove') this.state.delete(pending.key)
      this.pendingEvents.delete(ack.seq)
      changed = true
    }
    if (changed) {
      this.saveState()
      this.lastSyncAt = Date.now()
      this.emitStatus()
    }
  }

  waitForEvents(since: number, timeoutMs: number): Promise<PollResult> {
    const ready = (): PollResult | null => {
      if (this.fullSyncRequested) {
        this.fullSyncRequested = false
        return {
          session: SESSION_ID,
          cursor: this.seq,
          reset: true,
          fullSync: true,
          events: []
        }
      }
      if (this.resetRequested) {
        this.resetRequested = false
        return { session: SESSION_ID, cursor: this.seq, reset: true, fullSync: false, events: [] }
      }
      const events = this.queue.filter((event) => event.seq > since)
      if (events.length > 0) {
        return {
          session: SESSION_ID,
          cursor: events[events.length - 1].seq,
          reset: false,
          fullSync: false,
          events
        }
      }
      return null
    }

    const immediate = ready()
    if (immediate) return Promise.resolve(immediate)

    return new Promise((resolve) => {
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        const result = ready()
        resolve(
          result ?? {
            session: SESSION_ID,
            cursor: since,
            reset: false,
            fullSync: false,
            events: []
          }
        )
      }
      const timer = setTimeout(finish, timeoutMs)
      this.waiters.push(() => {
        clearTimeout(timer)
        finish()
      })
    })
  }
}
