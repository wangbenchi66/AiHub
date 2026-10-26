const dot = document.getElementById('dot')
const state = document.getElementById('state')
const meta = document.getElementById('meta')
const button = document.getElementById('sync')
const enabledInput = document.getElementById('enabled')

async function render() {
  const stored = await chrome.storage.local.get(['bridgeStatus', 'syncEnabled'])
  const status = stored.bridgeStatus || {}
  const enabled = stored.syncEnabled !== false
  const connected = enabled && Boolean(status.connected)

  enabledInput.checked = enabled
  dot.className = `dot${!enabled ? ' paused' : connected ? ' on' : ''}`
  state.textContent = !enabled
    ? '同步已暂停'
    : connected
      ? '已连接 AiHub'
      : '未连接（请打开 AiHub）'

  const lines = []
  if (status.lastSync) {
    const time = new Date(status.lastSync).toLocaleTimeString()
    lines.push(`上次同步：${time}`)
  }
  if (enabled && status.lastError) lines.push(`状态：${status.lastError}`)
  if (enabled && status.port) lines.push(`本地端口：${status.port}`)
  if (!enabled) lines.push('Cookie 不会读取或写入，重新开启后会做一次全量对账。')
  meta.textContent = lines.join('\n')
  meta.style.whiteSpace = 'pre-line'

  button.disabled = !enabled
  button.textContent = enabled ? '立即同步' : '同步已暂停'
}

enabledInput.addEventListener('change', async () => {
  const wanted = enabledInput.checked
  enabledInput.disabled = true
  try {
    const result = await chrome.runtime.sendMessage({
      type: 'set-sync-enabled',
      enabled: wanted
    })
    if (!result || !result.ok) throw new Error('toggle failed')
  } catch {
    enabledInput.checked = !wanted
  } finally {
    enabledInput.disabled = false
    await render()
  }
})

button.addEventListener('click', async () => {
  if (button.disabled) return
  button.disabled = true
  button.textContent = '同步中…'
  try {
    await chrome.runtime.sendMessage({ type: 'sync-now' })
  } finally {
    await render()
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.bridgeStatus || changes.syncEnabled)) {
    void render()
  }
})

void render()
