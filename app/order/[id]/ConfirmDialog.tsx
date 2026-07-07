'use client'

import { useEffect } from 'react'

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  exiting,
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel: string
  busy: boolean
  exiting: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className={`confirm-dialog__backdrop${exiting ? ' confirm-dialog__backdrop--exiting' : ''}`}
      data-testid="confirm-dialog-backdrop"
      onClick={onClose}
    >
      <div
        className={`confirm-dialog${exiting ? ' confirm-dialog--exiting' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="confirm-dialog__title">{title}</h2>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button type="button" className="confirm-dialog__cancel" onClick={onClose} disabled={busy}>
            Never mind
          </button>
          <button type="button" className="confirm-dialog__confirm" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
