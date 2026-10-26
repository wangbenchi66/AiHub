import type { ReactElement } from 'react'
import chromeIcon from '../assets/browsers/chrome.png'
import edgeIcon from '../assets/browsers/edge.png'
import braveIcon from '../assets/browsers/brave.svg'

const ICONS: Record<string, string> = {
  chrome: chromeIcon,
  edge: edgeIcon,
  brave: braveIcon
}

export function BrowserIcon({ id, size = 32 }: { id: string; size?: number }): ReactElement {
  const icon = ICONS[id]
  if (icon) {
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain' }} draggable={false} />
  }
  return (
    <span
      className="browser-fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {id.slice(0, 1).toUpperCase()}
    </span>
  )
}
