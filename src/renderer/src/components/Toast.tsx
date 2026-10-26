import type { ReactElement } from 'react'

export function Toast({ message }: { message: string | null }): ReactElement | null {
  if (!message) return null
  return <div className="toast">{message}</div>
}
