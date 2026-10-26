import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import type {
  BridgeInfo,
  BrowserBinding,
  BrowserInfo,
  SyncPolicy,
  SyncStatus
} from '@shared/types'
import { BrowserIcon } from './BrowserIcon'
import appIcon from '../assets/app-icon.png'

export function Onboarding({
  browsers,
  sync,
  onSkip,
  onLink,
  onPick
}: {
  browsers: BrowserInfo[]
  sync: SyncStatus
  onSkip: () => void
  onLink: (binding: BrowserBinding, policy: SyncPolicy) => Promise<void>
  onPick: () => Promise<BrowserInfo | null>
}): ReactElement {
  const [extra, setExtra] = useState<BrowserInfo[]>([])
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [bridgeInfo, setBridgeInfo] = useState<BridgeInfo | null>(null)
  const [policy, setPolicy] = useState<SyncPolicy>({
    conflict: 'browser'
  })
  const [pageHint, setPageHint] = useState('')

  const all = useMemo(() => {
    const byId = new Map<string, BrowserInfo>()
    for (const browser of [...browsers, ...extra]) byId.set(browser.id + browser.exe, browser)
    return [...byId.values()]
  }, [browsers, extra])

  const first = all.find((b) => b.supported && b.profiles.length > 0) ?? all.find((b) => b.supported)
  const [selectedKey, setSelectedKey] = useState<string>(first ? first.id + first.exe : '')
  const [profileDir, setProfileDir] = useState<string>(first?.profiles[0]?.dir ?? '')

  const selected = all.find((b) => b.id + b.exe === selectedKey)
  const binding: BrowserBinding | null = selected && profileDir
    ? {
        id: selected.id,
        label: selected.label,
        exe: selected.exe,
        userDataDir: selected.userDataDir,
        profileDir,
        profileName: selected.profiles.find((p) => p.dir === profileDir)?.name ?? profileDir
      }
    : null

  useEffect(() => {
    if (!selected) return
    if (!selected.profiles.some((p) => p.dir === profileDir)) {
      setProfileDir(selected.profiles[0]?.dir ?? '')
    }
  }, [selected, profileDir])

  useEffect(() => {
    if (step !== 2) return
    let alive = true
    window.aihub
      .bridgeInfo()
      .then((info) => { if (alive) setBridgeInfo(info) })
      .catch(() => { if (alive) setBridgeInfo(null) })
    return () => { alive = false }
  }, [step])

  const pick = async (): Promise<void> => {
    try {
      const browser = await onPick()
      if (!browser) return
      setExtra((prev) => [...prev, browser])
      setSelectedKey(browser.id + browser.exe)
      setProfileDir(browser.profiles[0]?.dir ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : '选择失败')
    }
  }

  const openFolder = async (): Promise<void> => {
    try {
      await window.aihub.openExtensionFolder()
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开目录失败')
    }
  }

  const openExtensionsPage = async (): Promise<void> => {
    if (!selected) return
    try {
      const result = await window.aihub.openExtensionsPage({
        id: selected.id,
        exe: selected.exe,
        profileDir: binding?.profileDir
      })
      setPageHint(
        result === 'browser'
          ? '浏览器已启动；如果没自动打开扩展页，地址已复制，先按 Ctrl/Cmd+L 聚焦地址栏，再按 Ctrl/Cmd+V 粘贴并回车。'
          : ''
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : '打开扩展管理页失败')
    }
  }

  const finish = async (): Promise<void> => {
    if (!binding) return
    setBusy(true)
    setError('')
    try {
      await onLink(binding, policy)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
      setBusy(false)
    }
  }

  const stepTitle = step === 1 ? '选择要共享登录态的浏览器' : step === 2 ? '安装 Bridge 扩展' : '同步策略'

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding">
        <div className="onboarding-top">
          <div className="onboarding-brand">
            <span className="mini-logo">
              <img src={appIcon} alt="" />
            </span>
            AiHub
          </div>
          <div className="step-pill">第 {step} 步 / 3 · {stepTitle}</div>
        </div>

        <h1>{stepTitle}</h1>

        {step === 1 ? (
          <>
            <p className="onboarding-sub">
              检测到 <b>{all.filter((b) => b.supported).length} 个可用浏览器</b>。选择你平时登录常用站点的那个，
              AiHub 会和它双向同步 Cookie、localStorage 与 sessionStorage，两边都不用二次登录。
            </p>

            {all.length === 0 ? (
              <div className="onboarding-empty">
                <p>没有检测到 Chromium 浏览器</p>
                <span>你可以先跳过，在 AiHub 内登录；安装 Chrome / Edge / Brave 后再来设置。</span>
                <button className="btn" onClick={pick}>手动选择浏览器</button>
              </div>
            ) : (
              <>
                <div className="browser-cards">
                  {all.map((browser) => {
                    const key = browser.id + browser.exe
                    const active = key === selectedKey
                    return (
                      <button
                        key={key}
                        className={`browser-choice${active ? ' selected' : ''}${browser.supported ? '' : ' disabled'}`}
                        onClick={() => {
                          if (!browser.supported) return
                          setSelectedKey(key)
                          setProfileDir(browser.profiles[0]?.dir ?? '')
                        }}
                        disabled={!browser.supported}
                      >
                        <span className="choice-icon">
                          <BrowserIcon id={browser.id} size={32} />
                        </span>
                        <span className="choice-body">
                          <b>{browser.label}</b>
                          <span>
                            {browser.supported
                              ? browser.running ? '运行中' : '未运行'
                              : browser.note ?? '暂不支持'}
                          </span>
                        </span>
                        <span className="choice-count">
                          {browser.supported ? `${browser.profiles.length} 个 Profile` : '不可用'}
                        </span>
                        {active ? (
                          <span className="choice-check">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M2 5.2l2 2 4-4.4" />
                            </svg>
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                  <button className="browser-choice manual" onClick={pick}>
                    <span className="choice-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="choice-body">
                      <b>手动选择</b>
                      <span>便携版 / 其他 Chromium</span>
                    </span>
                  </button>
                </div>

                <div className="profile-row">
                  <span className="label">登录 Profile</span>
                  <div className="select-wrap">
                    <select
                      value={profileDir}
                      onChange={(event) => setProfileDir(event.target.value)}
                      disabled={!selected || selected.profiles.length === 0}
                    >
                      {selected?.profiles.length ? (
                        selected.profiles.map((profile) => (
                          <option key={profile.dir} value={profile.dir}>
                            {profile.name}（{profile.dir}）
                          </option>
                        ))
                      ) : (
                        <option value="">请先启动一次浏览器</option>
                      )}
                    </select>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
                      <path d="M2.5 4.5L6 8l3.5-3.5" />
                    </svg>
                  </div>
                  <span className="hint">Bridge 扩展要装在这个 Profile 里</span>
                </div>
              </>
            )}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <p className="onboarding-sub">
              在 <b>{binding?.label ?? '浏览器'}</b> 的扩展管理页加载一次 Bridge。它只申请 Cookie 与同步所需权限，
              不读取页面内容、不修改浏览器设置。
            </p>

            <div className="bridge-status">
              <span className={`status-dot ${sync.connected ? 'connected' : 'waiting'}`} />
              <div>
                <b>{sync.connected ? 'Bridge 已连接' : '等待 Bridge 连接'}</b>
                <span>{sync.connected ? `本地端口 ${sync.port ?? '—'}` : '加载扩展后会自动检测'}</span>
              </div>
            </div>

            <ol className="install-steps">
              <li>点击“打开扩展管理页”，开启右上角“开发者模式”。</li>
              <li>点击“加载已解压的扩展程序”，选择下面这个目录。</li>
              <li>回到 AiHub，连接状态会自动变成“Bridge 已连接”。</li>
            </ol>

            <div className="path-box" title={bridgeInfo?.extensionPath}>
              {bridgeInfo?.extensionPath ?? '正在获取扩展目录…'}
            </div>

            <div className="bridge-actions">
              <button className="btn primary" onClick={() => void openExtensionsPage()}>打开扩展管理页</button>
              <button className="btn" onClick={() => void openFolder()}>打开扩展目录</button>
            </div>

            <p className="hint">
              没有看到扩展？确认它加载在上面的 Profile 中；浏览器没启动时先启动一次。
            </p>
            {pageHint ? <p className="hint">{pageHint}</p> : null}
            <p className="hint">
              Chrome 会提示“读取所有网站数据”，这是为了同步所有站点的 Cookie、localStorage 和 sessionStorage；Bridge 不读取页面内容。
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <p className="onboarding-sub">
              两边同时修改同一个 Cookie 时，需要一个默认赢家。之后可以在设置里随时修改。
            </p>

            <div className="policy-options">
              <label className={`policy-option${policy.conflict === 'browser' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  checked={policy.conflict === 'browser'}
                  onChange={() => setPolicy((p) => ({ ...p, conflict: 'browser' }))}
                />
                <span>
                  <b>以浏览器为准（推荐）</b>
                  <span>首次同步用浏览器登录态作为种子，冲突时覆盖 AiHub。</span>
                </span>
              </label>
              <label className={`policy-option${policy.conflict === 'app' ? ' selected' : ''}`}>
                <input
                  type="radio"
                  checked={policy.conflict === 'app'}
                  onChange={() => setPolicy((p) => ({ ...p, conflict: 'app' }))}
                />
                <span>
                  <b>以 AiHub 为准</b>
                  <span>主要在 AiHub 内登录时选择，冲突时覆盖浏览器。</span>
                </span>
              </label>
            </div>

            <div className="notice">
              当前为全站凭证模式：浏览器中所有站点的 Cookie、localStorage 和 sessionStorage 都会参与同步，包括登录态。
            </div>
          </>
        ) : null}

        {error ? <div className="onboarding-error">{error}</div> : null}

        <div className="onboarding-divider" />

        <div className="onboarding-bottom">
          <div className="privacy-note">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
              <path d="M8 1.8l5 1.9v4.1c0 3.1-2.1 5.3-5 6.4-2.9-1.1-5-3.3-5-6.4V3.7l5-1.9z" />
              <path d="M6 7.8l1.4 1.4 2.7-2.8" />
            </svg>
            同步浏览器所有站点的 Cookie 与本地存储凭证，不读取密码、书签或浏览记录
          </div>

          <div className="onboarding-actions">
            {step === 1 ? (
              <button className="btn" onClick={onSkip}>稍后设置</button>
            ) : (
              <button className="btn" onClick={() => setStep(step - 1)}>上一步</button>
            )}
            {step < 3 ? (
              <button
                className="btn primary"
                disabled={step === 1 && (!binding || busy)}
                onClick={() => setStep(step + 1)}
              >
                {step === 2 && !sync.connected ? '稍后连接' : '下一步'}
              </button>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => void finish()}>
                {busy ? '保存中…' : '完成'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
