import type { ReactElement } from 'react'

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '删除',
  onCancel,
  onConfirm
}: {
  title: string
  message: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}): ReactElement {
  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal confirm" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
        </div>
        <div className="modal-body">
          <p className="confirm-message">{message}</p>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>取消</button>
          <button className="btn danger" onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
