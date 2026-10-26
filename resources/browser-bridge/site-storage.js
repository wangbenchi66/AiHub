/* Copy the page's web-storage credentials (localStorage + sessionStorage) to
 * AiHub. Credentials are only sent to the local AiHub service. */
const STARTED_AT = Date.now()
let lastSnapshot = ''

function readStorage(storage) {
  const items = {}
  let total = 0
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i)
      if (!key || key.length > 256) continue
      const value = storage.getItem(key)
      if (value === null || value.length > 200_000) continue
      if (total + value.length > 512_000) break
      items[key] = value
      total += value.length
      if (Object.keys(items).length >= 500) break
    }
  } catch {
    // storage can be unavailable in a sandboxed frame
  }
  return items
}

function send(force = false) {
  const origin = location.origin
  if (!origin || origin === 'null') return
  const local = readStorage(localStorage)
  const session = readStorage(sessionStorage)
  const snapshot = JSON.stringify({ origin, local, session })
  // localStorage may still be empty on the first frame.
  if (
    snapshot === JSON.stringify({ origin, local: {}, session: {} }) &&
    Date.now() - STARTED_AT < 2000
  ) {
    return
  }
  if (!force && snapshot === lastSnapshot) return
  lastSnapshot = snapshot
  try {
    chrome.runtime.sendMessage(
      { type: 'site-storage', origin, local, session },
      () => void chrome.runtime.lastError
    )
  } catch {
    // service worker may be restarting
  }
}

send(true)
setTimeout(() => send(true), 1500)
setTimeout(() => send(true), 5000)
setInterval(() => send(false), 5000)
window.addEventListener('storage', () => send(true))
window.addEventListener('pageshow', () => send(true))
