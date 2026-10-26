import type { ReactElement } from 'react'

export function SearchBar({
  value,
  onChange,
  onSubmit,
  shortcutLabel
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  shortcutLabel: string
}): ReactElement {
  return (
    <div className="search-wrap">
      <div className="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        <input
          id="global-search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSubmit(value)
          }}
          placeholder="搜索 AI 工具，或粘贴网址直接打开…"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="kbd">{shortcutLabel}</span>
      </div>
    </div>
  )
}
