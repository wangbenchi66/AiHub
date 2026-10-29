import { createElement, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Provider } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'

interface WebviewElement extends HTMLElement {
  back: () => void
  forward: () => void
  reload: () => void
  stop: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  getURL: () => string
  loadURL: (url: string) => Promise<void> | void
  executeJavaScript: (code: string) => Promise<unknown>
  openDevTools: (options?: { mode?: string }) => void
}

function normalizeAddress(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const parsed = new URL(withScheme)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

export function ProviderView({
  provider,
  active,
  onTitle,
  onToast
}: {
  provider: Provider
  active: boolean
  onTitle: (title: string) => void
  onToast: (message: string) => void
}): ReactElement {
  const webviewRef = useRef<WebviewElement | null>(null)
  const addressFocusedRef = useRef(false)
  const storageAppliedRef = useRef<Set<string>>(new Set())
  const [url, setUrl] = useState(provider.url)
  const [addressValue, setAddressValue] = useState(provider.url)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const el = webviewRef.current
    if (!el) return

    const update = (): void => {
      try {
        const next = el.getURL() || provider.url
        setUrl(next)
        if (!addressFocusedRef.current) setAddressValue(next)
        setCanBack(el.canGoBack())
        setCanForward(el.canGoForward())
      } catch {
        // webview not ready
      }
    }

    const onStart = (): void => {
      setLoading(true)
      setError(false)
    }
    const onStop = (): void => {
      setLoading(false)
      update()
    }
    const onNav = (): void => update()
    const onTitleEvent = (event: Event): void => {
      const title = (event as Event & { title?: string }).title
      if (title) onTitle(title)
    }
    const onFail = (event: Event): void => {
      const code = (event as Event & { errorCode?: number }).errorCode
      if (code === -3) return
      setLoading(false)
      setError(true)
    }

    const applyStoredStorage = async (): Promise<void> => {
      try {
        const current = new URL(el.getURL())
        if (current.protocol !== 'http:' && current.protocol !== 'https:') return
        if (storageAppliedRef.current.has(current.origin)) return
        const stored = await window.aihub.storageGet(current.origin)
        if (!stored) return
        const local = stored.local || {}
        const session = stored.session || {}
        if (Object.keys(local).length === 0 && Object.keys(session).length === 0) return
        const payload = JSON.stringify({ local, session })
          .replace(/\u2028/g, '\\u2028')
          .replace(/\u2029/g, '\\u2029')
        await el.executeJavaScript(`(() => {
          const data = ${payload};
          for (const key of Object.keys(data.local)) {
            try { localStorage.setItem(key, data.local[key]); } catch {}
          }
          for (const key of Object.keys(data.session)) {
            try { sessionStorage.setItem(key, data.session[key]); } catch {}
          }
          return Object.keys(data.local).length + Object.keys(data.session).length;
        })()`)
        storageAppliedRef.current.add(current.origin)
        // The page may have already rendered its login screen before storage was
        // available; one reload lets the SPA read the restored credentials.
        el.reload()
      } catch {
        // the webview may be between navigations
      }
    }

    const onDomReady = (): void => {
      void applyStoredStorage()
      window.setTimeout(() => void applyStoredStorage(), 1200)
    }

    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-navigate', onNav)
    el.addEventListener('did-navigate-in-page', onNav)
    el.addEventListener('page-title-updated', onTitleEvent)
    el.addEventListener('did-fail-load', onFail)
    el.addEventListener('dom-ready', onDomReady)

    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-navigate', onNav)
      el.removeEventListener('did-navigate-in-page', onNav)
      el.removeEventListener('page-title-updated', onTitleEvent)
      el.removeEventListener('did-fail-load', onFail)
      el.removeEventListener('dom-ready', onDomReady)
    }
  }, [onTitle, provider.url])

  useEffect(() => {
    const el = webviewRef.current
    if (!el) return

    if (!active) {
      try {
        el.blur()
      } catch {
        // hidden webview may already be detached
      }
      return
    }

    let disposed = false
    let focusTimer: number | undefined
    const focusInput = (): void => {
      if (disposed) return
      try {
        // macOS IME keeps the input context of the last focused WebContents.
        // Blur, then focus on the next tick, makes the newly selected webview
        // own the input method again.
        el.blur()
      } catch {
        // webview not ready
      }
      window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(() => {
        if (disposed) return
        try {
          el.focus()
        } catch {
          // webview not ready
        }
      }, 20)
    }
    const timer = window.setTimeout(focusInput, 60)
    el.addEventListener('dom-ready', focusInput)
    window.addEventListener('focus', focusInput)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      window.clearTimeout(focusTimer)
      el.removeEventListener('dom-ready', focusInput)
      window.removeEventListener('focus', focusInput)
    }
  }, [active])

  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return url
    }
  })()

  const call = (method: 'back' | 'forward' | 'reload' | 'stop'): void => {
    try {
      webviewRef.current?.[method]()
    } catch {
      // ignore
    }
  }

  const go = (value: string): void => {
    const next = normalizeAddress(value)
    if (!next) {
      onToast('请输入有效的 http(s) 地址')
      return
    }
    setUrl(next)
    setAddressValue(next)
    try {
      void webviewRef.current?.loadURL(next)
    } catch {
      onToast('页面还没有准备好')
    }
  }

  const openNative = async (): Promise<void> => {
    setMenuOpen(false)
    try {
      await window.aihub.openNative(provider.id)
    } catch (err) {
      onToast(err instanceof Error ? err.message : '打开浏览器失败')
    }
  }

  const openDefaultBrowser = async (): Promise<void> => {
    setMenuOpen(false)
    try {
      await window.aihub.openExternal(url)
    } catch (err) {
      onToast(err instanceof Error ? err.message : '打开系统默认浏览器失败')
    }
  }

  return (
    <section className="provider-view" style={{ display: active ? 'flex' : 'none' }}>
      <div className="provider-toolbar">
        <div className="nav-group">
          <button className="nav-btn" title="后退" disabled={!canBack} onClick={() => call('back')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>
          <button className="nav-btn" title="前进" disabled={!canForward} onClick={() => call('forward')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3l5 5-5 5" />
            </svg>
          </button>
          <button className="nav-btn" title="刷新" onClick={() => call('reload')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.8V6h-3.2" />
            </svg>
          </button>
        </div>

        <div className="address" title={url}>
          <ProviderIcon provider={provider} size={14} />
          <input
            value={addressValue}
            aria-label="地址栏"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            onChange={(event) => setAddressValue(event.target.value)}
            onFocus={(event) => {
              addressFocusedRef.current = true
              event.currentTarget.select()
            }}
            onBlur={() => {
              addressFocusedRef.current = false
              setAddressValue(url)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                go(addressValue)
                event.currentTarget.blur()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                setAddressValue(url)
                event.currentTarget.blur()
              }
            }}
          />
        </div>

        <div className="toolbar-actions">
          <button className="nav-btn" title="用系统默认浏览器打开" onClick={() => void openDefaultBrowser()}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3h4v4M13 3L7 9" />
              <path d="M12 9.5V13H3V4h3.5" />
            </svg>
          </button>
          <div className="menu-wrap">
            <button className="nav-btn" title="更多" onClick={() => setMenuOpen((v) => !v)}>
              <svg viewBox="0 0 16 16" fill="currentColor">
                <circle cx="3.2" cy="8" r="1.2" />
                <circle cx="8" cy="8" r="1.2" />
                <circle cx="12.8" cy="8" r="1.2" />
              </svg>
            </button>
            {menuOpen ? (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => { call('reload'); setMenuOpen(false) }}>刷新</button>
                <button onClick={async () => { await navigator.clipboard.writeText(url); onToast('链接已复制'); setMenuOpen(false) }}>复制链接</button>
                <button onClick={() => void openDefaultBrowser()}>用系统默认浏览器打开</button>
                <button onClick={openNative}>用已链接浏览器打开（应用窗口）</button>
                <button onClick={() => { webviewRef.current?.openDevTools({ mode: 'detach' }); setMenuOpen(false) }}>开发者工具</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="webview-wrap">
        {loading ? <div className="loading-bar" /> : null}
        {error ? (
          <div className="webview-error">
            <p>页面加载失败</p>
            <span>{host}</span>
            <button onClick={() => { setError(false); call('reload') }}>重新加载</button>
          </div>
        ) : null}
        {createElement('webview', {
          ref: webviewRef,
          src: provider.url,
          partition: 'persist:aihub',
          allowpopups: 'true',
          webpreferences: 'contextIsolation=yes, nodeIntegration=no, sandbox=yes',
          className: 'webview'
        })}
      </div>
    </section>
  )
}
