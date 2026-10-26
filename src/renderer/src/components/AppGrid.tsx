import type { ReactElement } from 'react'
import type { Provider } from '@shared/types'
import { AppTile } from './AppTile'

export function AppGrid({
  providers,
  favorites,
  onOpen,
  onToggleFavorite,
  onAdd
}: {
  providers: Provider[]
  favorites: string[]
  onOpen: (provider: Provider) => void
  onToggleFavorite: (provider: Provider) => void
  onAdd?: () => void
}): ReactElement {
  const favoriteSet = new Set(favorites)

  return (
    <div className="grid">
      {providers.map((provider) => (
        <AppTile
          key={provider.id}
          provider={provider}
          favorite={favoriteSet.has(provider.id)}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
      {onAdd ? (
        <button className="tile add" onClick={onAdd} title="添加自定义站点">
          <span className="tile-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span className="tile-name">添加应用</span>
        </button>
      ) : null}
    </div>
  )
}
