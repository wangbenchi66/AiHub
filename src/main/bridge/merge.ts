import { createHash } from 'node:crypto'
import type { BridgeCookie, SyncOp } from '@shared/types'

export type CookieMap = Map<string, BridgeCookie>

export function cookieKey(cookie: Pick<BridgeCookie, 'domain' | 'path' | 'name'>): string {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`
}

export function canonicalCookie(cookie: BridgeCookie): string {
  // Do not include expirationDate: Chromium clamps lifetimes (e.g. 400 days),
  // so comparing raw expiry would make browser/app look different forever.
  return JSON.stringify({
    value: cookie.value,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || 'unspecified',
    hostOnly: Boolean(cookie.hostOnly),
    session: Boolean(cookie.session)
  })
}

export function hashCookie(cookie: BridgeCookie): string {
  return createHash('sha256').update(canonicalCookie(cookie)).digest('hex')
}

export function cookieUrl(cookie: Pick<BridgeCookie, 'domain' | 'path' | 'secure'>): string {
  const host = cookie.domain.replace(/^\./, '')
  const scheme = cookie.secure ? 'https' : 'http'
  return `${scheme}://${host}${cookie.path || '/'}`
}

export function toElectronDetails(
  cookie: BridgeCookie
): Electron.CookiesSetDetails {
  const details: Electron.CookiesSetDetails = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite
  }
  if (!cookie.session && cookie.expirationDate) {
    details.expirationDate = cookie.expirationDate
  }
  if (!cookie.hostOnly) {
    details.domain = cookie.domain
  }
  return details
}

export function fromElectronCookie(cookie: Electron.Cookie): BridgeCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain ?? '',
    path: cookie.path ?? '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite ?? 'unspecified',
    expirationDate: cookie.expirationDate,
    session: Boolean(cookie.session),
    hostOnly: Boolean(cookie.hostOnly)
  }
}

export interface MergeInput {
  browser: CookieMap
  app: CookieMap
  state: Map<string, string>
  policy: 'browser' | 'app'
}

export interface MergeResult {
  toAppSet: BridgeCookie[]
  toAppRemove: BridgeCookie[]
  toBrowser: SyncOp[]
  state: Map<string, string>
  conflicts: number
}

/**
 * Three-way merge: B = browser, A = app, S = last synced hash.
 * `state` is the final state for no-op / browser->app writes; browser ops are
 * committed only after the extension acks them (handled by SyncEngine).
 */
export function mergeCookies({ browser, app, state, policy }: MergeInput): MergeResult {
  const keys = new Set<string>([
    ...browser.keys(),
    ...app.keys(),
    ...state.keys()
  ])
  const nextState = new Map(state)
  const toAppSet: BridgeCookie[] = []
  const toAppRemove: BridgeCookie[] = []
  const toBrowser: SyncOp[] = []
  let conflicts = 0

  for (const key of keys) {
    const b = browser.get(key)
    const a = app.get(key)
    const s = state.get(key)
    const hb = b ? hashCookie(b) : undefined
    const ha = a ? hashCookie(a) : undefined

    if (b && a) {
      if (hb === ha) {
        nextState.set(key, hb as string)
        continue
      }
      if (ha === s) {
        toAppSet.push(b)
        continue
      }
      if (hb === s) {
        toBrowser.push({ op: 'set', key, cookie: a, hash: ha })
        continue
      }
      conflicts += 1
      if (policy === 'browser') {
        toAppSet.push(b)
      } else {
        toBrowser.push({ op: 'set', key, cookie: a, hash: ha })
      }
      continue
    }

    if (b && !a) {
      if (s === undefined) {
        toAppSet.push(b)
        continue
      }
      if (hb === s) {
        toBrowser.push({ op: 'remove', key, cookie: b })
        continue
      }
      conflicts += 1
      if (policy === 'browser') {
        toAppSet.push(b)
      } else {
        toBrowser.push({ op: 'remove', key, cookie: b })
        // state is cleared only after ack
      }
      continue
    }

    if (!b && a) {
      if (s === undefined) {
        toBrowser.push({ op: 'set', key, cookie: a, hash: ha })
        continue
      }
      if (ha === s) {
        toAppRemove.push(a)
        continue
      }
      conflicts += 1
      if (policy === 'browser') {
        toAppRemove.push(a)
      } else {
        toBrowser.push({ op: 'set', key, cookie: a, hash: ha })
      }
      continue
    }

    nextState.delete(key)
  }

  return { toAppSet, toAppRemove, toBrowser, state: nextState, conflicts }
}
