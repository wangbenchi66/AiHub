import { useEffect, useRef, useState } from 'react'
import type { ReactElement, MouseEvent } from 'react'
import type { Provider } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'

export function AppTile({
  provider,
  favorite,
  onOpen,
  onToggleFavorite,
  onEdit,
  onDelete
}: {
  provider: Provider
  favorite: boolean
  onOpen: (provider: Provider) => void
  onToggleFavorite: (provider: Provider) => void
  onEdit: (provider: Provider) => void
  onDelete: (provider: Provider) => void
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: globalThis.MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const toggle = (event: MouseEvent): void => {
    event.stopPropagation()
    onToggleFavorite(provider)
  }

  const toggleMenu = (event: MouseEvent): void => {
    event.stopPropagation()
    setMenuOpen((value) => !value)
  }

  return (
    <div
      ref={rootRef}
      className={`tile${menuOpen ? ' menu-open' : ''}`}
      role="button"
      tabIndex={0}
      title={provider.url}
      onClick={() => {
        if (menuOpen) {
          setMenuOpen(false)
          return
        }
        onOpen(provider)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        setMenuOpen(true)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(provider)
        }
      }}
    >
      <span className="tile-ico">
        <ProviderIcon provider={provider} size={34} />
      </span>
      <span className="tile-name">{provider.name}</span>

      <button
        className="tile-menu-btn"
        title="更多操作"
        aria-label="更多操作"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        <svg viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3.2" cy="8" r="1.15" />
          <circle cx="8" cy="8" r="1.15" />
          <circle cx="12.8" cy="8" r="1.15" />
        </svg>
      </button>

      {menuOpen ? (
        <div className="tile-menu" role="menu" onClick={(event) => event.stopPropagation()}>
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onEdit(provider)
            }}
          >
            编辑
          </button>
          <button
            className="danger"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false)
              onDelete(provider)
            }}
          >
            删除
          </button>
        </div>
      ) : null}

      <button
        className={`tile-star${favorite ? ' on' : ''}`}
        title={favorite ? '取消收藏' : '收藏'}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2">
          <path d="M8 1.8l1.8 3.7 4 .6-2.9 2.9.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.1l4-.6L8 1.8z" />
        </svg>
      </button>
    </div>
  )
}
