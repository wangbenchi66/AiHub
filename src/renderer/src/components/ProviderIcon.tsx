import type { ReactElement } from 'react'
import type { Provider } from '@shared/types'
import { isMonoIcon, providerIcon } from '../lib/icons'

export function ProviderIcon({
  provider,
  size = 28
}: {
  provider: Provider
  size?: number
}): ReactElement {
  const src = providerIcon(provider.icon)
  if (src) {
    return (
      <img
        className={`provider-img${isMonoIcon(provider.icon) ? ' mono' : ''}`}
        src={src}
        alt=""
        style={{ width: size, height: size }}
        draggable={false}
      />
    )
  }
  return (
    <span
      className="provider-fallback"
      style={{
        width: size,
        height: size,
        background: provider.color || '#5B5BD6',
        fontSize: Math.max(10, Math.round(size * 0.4))
      }}
    >
      {provider.name.slice(0, 1)}
    </span>
  )
}
