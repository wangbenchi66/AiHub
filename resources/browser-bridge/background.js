/* AiHub Bridge — syncs cookies for all sites, only with local AiHub. */
const PORTS = [45731, 45732, 45733, 45734, 45735, 45736, 45737, 45738, 45739, 45740]
const HEADERS = { 'Content-Type': 'application/json', 'X-AiHub-Bridge': '1' }

let port = null
let session = null
let cursor = 0
let polling = false
let syncing = false
let waitingForLink = false
let syncEnabled = true
let ready = false
let lastSync = 0
let lastError = ''
let applied = 0
let conflicts = 0

let preferredPort = null
let probeRound = 0
let reconnectDelay = 5000
let retryTimer = null
let pollAbort = null
let pollToken = 0

const suppress = new Map()
const suppressRemove = new Map()
let changeQueue = []
let flushTimer = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cookieKey(cookie) {
  return `${cookie.domain}|${cookie.path}|${cookie.name}`
}

function cookieUrl(cookie) {
  const host = cookie.domain.replace(/^\./, '')
  return `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`
}

function mapCookie(cookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || 'unspecified',
    expirationDate: cookie.expirationDate,
    session: Boolean(cookie.session),
    hostOnly: Boolean(cookie.hostOnly)
  }
}

async function hashCookie(cookie) {
  const canonical = JSON.stringify({
    value: cookie.value,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || 'unspecified',
    hostOnly: Boolean(cookie.hostOnly),
    session: Boolean(cookie.session)
  })
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function prune() {
  const now = Date.now()
  for (const [key, until] of suppress) if (until <= now) suppress.delete(key)
  for (const [key, until] of suppressRemove) if (until <= now) suppressRemove.delete(key)
}

async function saveStatus(extra = {}) {
  const status = {
    connected: syncEnabled && Boolean(port),
    enabled: syncEnabled,
    port,
    lastSync,
    lastError,
    applied,
    conflicts,
    ...extra
  }
  try {
    await chrome.storage.local.set({ bridgeStatus: status })
  } catch {
    // ignore
  }
}

async function probe(candidate) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 900)
  try {
    const res = await fetch(`http://127.0.0.1:${candidate}/v1/health`, {
      headers: { 'X-AiHub-Bridge': '1' },
      signal: controller.signal,
      cache: 'no-store'
    })
    if (!res.ok) return null
    const data = await res.json()
    return data && data.app === 'AiHub' ? data : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function ensure() {
  if (!syncEnabled) throw new Error('同步已暂停')
  if (port && session) return

  // Probe the remembered port first. Full port scans run only on the first
  // attempt and every fourth retry, so a closed app cannot cause a health
  // request storm.
  const candidates = [preferredPort ?? PORTS[0]]
  if (probeRound % 4 === 0) {
    for (const candidate of PORTS) {
      if (!candidates.includes(candidate)) candidates.push(candidate)
    }
  }
  probeRound += 1

  for (const candidate of candidates) {
    const data = await probe(candidate)
    if (!data) continue
    port = candidate
    preferredPort = candidate
    if (session && data.session !== session) cursor = 0
    session = data.session
    reconnectDelay = 5000
    probeRound = 0
    return
  }
  throw new Error('AiHub 未运行')
}

async function api(path, options = {}) {
  if (!port) await ensure()
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...options,
    headers: { ...HEADERS, ...(options.headers || {}) },
    cache: 'no-store'
  })
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

async function collectCookies() {
  const seen = new Map()
  const cookies = await chrome.cookies.getAll({})
  for (const cookie of cookies) {
    if (cookie.partitionKey || !cookie.domain) continue
    const mapped = mapCookie(cookie)
    mapped.hash = await hashCookie(mapped)
    seen.set(cookieKey(cookie), mapped)
  }
  return [...seen.values()]
}

async function applyOp(op) {
  if (!op || !op.cookie) throw new Error('invalid op')
  if (op.op === 'remove') {
    suppressRemove.set(cookieKey(op.cookie), Date.now() + 3000)
    await chrome.cookies.remove({
      url: cookieUrl(op.cookie),
      name: op.cookie.name
    })
    return
  }

  const cookie = op.cookie
  const details = {
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || 'unspecified'
  }
  if (!cookie.session && cookie.expirationDate) details.expirationDate = cookie.expirationDate
  if (!cookie.hostOnly) details.domain = cookie.domain

  suppress.set(await hashCookie(cookie), Date.now() + 3000)
  const result = await chrome.cookies.set(details)
  if (!result) throw new Error('chrome.cookies.set failed')
}

function scheduleRetry() {
  if (!syncEnabled) return
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void fullSync()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 60_000)
}

async function fullSync() {
  if (!ready || !syncEnabled || syncing) return
  syncing = true
  try {
    await ensure()
    const cookies = await collectCookies()
    const result = await api('/v1/sync', {
      method: 'POST',
      body: JSON.stringify({ v: 2, session, cookies })
    })
    if (result.session) session = result.session

    const ok = []
    const failed = []
    for (const op of result.ops || []) {
      try {
        await applyOp(op)
        ok.push(op.key)
      } catch {
        failed.push(op.key)
      }
    }
    if (result.syncId) {
      await api('/v1/ack', {
        method: 'POST',
        body: JSON.stringify({ syncId: result.syncId, ok, failed })
      })
    }

    cursor = Number.isFinite(result.cursor) ? result.cursor : cursor
    lastSync = Date.now()
    waitingForLink = false
    applied = result.appliedToApp || 0
    conflicts = result.conflicts || 0
    lastError = failed.length ? `${failed.length} 个 Cookie 写入失败` : ''
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    reconnectDelay = 5000
    await saveStatus()
    startPolling()
    void flushSiteStorage()
  } catch (error) {
    if (error && error.status === 409) {
      // AiHub is running but no browser is linked yet. Keep the connection and
      // wait on the long poll; /v1/events is allowed before linking.
      waitingForLink = true
      lastError = '等待在 AiHub 中链接浏览器'
      await saveStatus()
      startPolling()
    } else if (error && error.status) {
      // The local server answered but rejected the payload. Keep the known
      // port/session and retry with backoff instead of probing health again.
      lastError = String(error.message || error)
      waitingForLink = false
      await saveStatus()
      scheduleRetry()
    } else {
      lastError = String(error && error.message ? error.message : error)
      waitingForLink = false
      port = null
      session = null
      await saveStatus()
      scheduleRetry()
    }
  } finally {
    syncing = false
  }
}

async function applyEvents(events) {
  if (!syncEnabled) return
  const acks = []
  for (const event of events) {
    try {
      await applyOp(event)
      acks.push({ seq: event.seq, ok: true })
    } catch {
      acks.push({ seq: event.seq, ok: false })
    }
  }
  if (acks.length) {
    try {
      await api('/v1/ack-events', {
        method: 'POST',
        body: JSON.stringify({ acks })
      })
    } catch {
      // full sync will reconcile later
    }
  }
}

function startPolling() {
  if (!ready || !syncEnabled || polling) return
  polling = true
  const token = ++pollToken
  void pollLoop(token)
}

async function pollLoop(token) {
  while (syncEnabled && token === pollToken) {
    try {
      await ensure()
      const controller = new AbortController()
      pollAbort = controller
      const timer = setTimeout(() => controller.abort(), 30_000)
      let data
      try {
        const res = await fetch(
          `http://127.0.0.1:${port}/v1/events?since=${cursor}&session=${session}`,
          {
            headers: { 'X-AiHub-Bridge': '1' },
            signal: controller.signal,
            cache: 'no-store'
          }
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        data = await res.json()
      } finally {
        if (pollAbort === controller) pollAbort = null
        clearTimeout(timer)
      }

      if (data.reset || data.fullSync) {
        await fullSync()
        continue
      }
      if (data.session) session = data.session
      if (Array.isArray(data.events) && data.events.length) {
        await applyEvents(data.events)
      }
      if (Number.isFinite(data.cursor)) cursor = data.cursor
    } catch {
      if (!syncEnabled || token !== pollToken) {
        if (token === pollToken) polling = false
        await saveStatus()
        return
      }
      port = null
      session = null
      waitingForLink = false
      await saveStatus()
      await sleep(reconnectDelay)
      reconnectDelay = Math.min(reconnectDelay * 2, 60_000)
    }
  }
}

async function flushChanges() {
  flushTimer = null
  if (!syncEnabled) {
    changeQueue = []
    return
  }
  if (!changeQueue.length) return
  const batch = changeQueue
  changeQueue = []
  try {
    await ensure()
    await api('/v1/events', {
      method: 'POST',
      body: JSON.stringify({ v: 2, session, events: batch })
    })
  } catch {
    changeQueue = [...batch, ...changeQueue].slice(-200)
  }
}

async function saveSiteStorage(origin, local, sessionStorageData) {
  if (!syncEnabled || !origin) return
  const payload = {
    origin,
    local: local && typeof local === 'object' ? local : {},
    session: sessionStorageData && typeof sessionStorageData === 'object'
      ? sessionStorageData
      : {}
  }
  if (!port || !session) {
    await chrome.storage.local.set({ pendingSiteStorage: payload })
    return
  }
  try {
    await api('/v1/storage', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  } catch {
    await chrome.storage.local.set({ pendingSiteStorage: payload })
  }
}

async function flushSiteStorage() {
  if (!syncEnabled || !port || !session) return
  const stored = await chrome.storage.local.get('pendingSiteStorage')
  const pending = stored.pendingSiteStorage
  if (!pending || !pending.origin) return
  try {
    await api('/v1/storage', {
      method: 'POST',
      body: JSON.stringify(pending)
    })
    await chrome.storage.local.remove('pendingSiteStorage')
  } catch {
    // keep for the next successful sync
  }
}

async function setSyncEnabled(enabled) {
  syncEnabled = Boolean(enabled)
  await chrome.storage.local.set({ syncEnabled })

  if (!syncEnabled) {
    if (pollAbort) pollAbort.abort()
    pollToken += 1
    chrome.alarms.clear('aihub-watchdog')
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    polling = false
    waitingForLink = false
    changeQueue = []
    lastError = ''
    await saveStatus()
    return
  }

  waitingForLink = false
  reconnectDelay = 5000
  probeRound = 0
  lastError = ''
  chrome.alarms.create('aihub-watchdog', { periodInMinutes: 1 })
  await saveStatus()
  void fullSync()
}

async function init() {
  try {
    const stored = await chrome.storage.local.get('syncEnabled')
    syncEnabled = stored.syncEnabled !== false
  } catch {
    syncEnabled = true
  }
  ready = true
  if (syncEnabled) {
    chrome.alarms.create('aihub-watchdog', { periodInMinutes: 1 })
  } else {
    chrome.alarms.clear('aihub-watchdog')
  }
  await saveStatus()
  if (syncEnabled) void fullSync()
}

chrome.cookies.onChanged.addListener(async (info) => {
  if (!ready || !syncEnabled) return
  if (info.cookie.partitionKey || !info.cookie.domain) return
  prune()
  if (info.removed) {
    if ((suppressRemove.get(cookieKey(info.cookie)) || 0) > Date.now()) return
    changeQueue.push({ op: 'remove', cookie: mapCookie(info.cookie) })
  } else {
    const cookie = mapCookie(info.cookie)
    const hash = await hashCookie(cookie)
    if ((suppress.get(hash) || 0) > Date.now()) return
    changeQueue.push({ op: 'set', cookie })
  }
  changeQueue = changeQueue.slice(-200)
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flushChanges(), 800)
})

chrome.runtime.onInstalled.addListener(() => {
  if (syncEnabled) chrome.alarms.create('aihub-watchdog', { periodInMinutes: 1 })
  if (ready && syncEnabled) void fullSync()
})

chrome.runtime.onStartup.addListener(() => {
  if (syncEnabled) chrome.alarms.create('aihub-watchdog', { periodInMinutes: 1 })
  if (ready && syncEnabled) void fullSync()
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'aihub-watchdog') return
  if (!ready || !syncEnabled) return
  if (waitingForLink) {
    startPolling()
    return
  }
  if (!lastSync || Date.now() - lastSync > 3 * 60_000) {
    void fullSync()
  } else {
    startPolling()
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'set-sync-enabled') {
    void setSyncEnabled(Boolean(message.enabled)).then(() =>
      sendResponse({ ok: true, enabled: syncEnabled })
    )
    return true
  }
  if (message && message.type === 'site-storage') {
    if (!ready || !syncEnabled) {
      sendResponse({ ok: false, disabled: true })
      return false
    }
    void saveSiteStorage(message.origin, message.local, message.session).then(() =>
      sendResponse({ ok: true })
    )
    return true
  }
  if (message && message.type === 'sync-now') {
    if (!ready || !syncEnabled) {
      sendResponse({ ok: false, disabled: true })
      return false
    }
    void fullSync().then(() => sendResponse({ ok: true }))
    return true
  }
  return false
})

void init()
