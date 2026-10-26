import type { ReactElement, MouseEvent } from 'react'
import type { Provider } from '@shared/types'
import { ProviderIcon } from './ProviderIcon'

export function AppTile({
  provider,
  favorite,
  onOpen,
  onToggleFavorite
}: {
  provider: Provider
  favorite: boolean
  onOpen: (provider: Provider) => void
  onToggleFavorite: (provider: Provider) => void
}): ReactElement {
  const toggle = (event: MouseEvent): void => {
    event.stopPropagation()
    onToggleFavorite(provider)
  }

  return (
    <div
      className="tile"
      role="button"
      tabIndex={0}
      title={provider.url}
      onClick={() => onOpen(provider)}
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
