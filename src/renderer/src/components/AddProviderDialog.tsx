import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Provider } from '@shared/types'

const COLORS = ['#5B5BD6', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function AddProviderDialog({
  provider,
  onClose,
  onSave
}: {
  provider?: Provider
  onClose: () => void
  onSave: (provider: Provider) => void
}): ReactElement {
  const editing = Boolean(provider)
  const [name, setName] = useState(provider?.name ?? '')
  const [url, setUrl] = useState(provider?.url ?? '')
  const [error, setError] = useState('')

  const submit = (): void => {
    const finalUrl = normalizeUrl(url)
    if (!name.trim()) {
      setError('请输入名称')
      return
    }
    try {
      const parsed = new URL(finalUrl)
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error()
    } catch {
      setError('请输入有效的网址')
      return
    }
    const color = provider?.color ??
      COLORS[Math.abs([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % COLORS.length]
    onSave({
      id: provider?.id ?? `custom-${Date.now()}`,
      name: name.trim(),
      url: finalUrl,
      icon: provider?.icon ?? '',
      color,
      group: provider?.group ?? '工具',
      enabled: provider?.enabled ?? true,
      custom: provider?.custom ?? true,
      pinned: provider?.pinned ?? false
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{editing ? '编辑应用' : '添加自定义站点'}</h2>
          <button className="icon-btn" onClick={onClose} title="关闭">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        <div className="modal-body">
          <label>
            <span>名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：我的 AI 助手" autoFocus />
          </label>
          <label>
            <span>网址</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            />
          </label>
          {error ? <div className="form-error">{error}</div> : null}
          <p className="hint">
            {editing
              ? '修改名称或网址后保存；已打开的标签会使用新地址重新加载。'
              : '自定义站点默认不参与 Cookie 同步，需在 Bridge 中手动授权域名（后续版本）。'}
          </p>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>{editing ? '保存' : '添加'}</button>
        </div>
      </div>
    </div>
  )
}
