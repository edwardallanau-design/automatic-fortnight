'use client'

import { Modal } from '@/app/components/Modal'

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
  return (
    <Modal
      ariaLabel={title}
      backdropClassName={`confirm-dialog__backdrop${exiting ? ' confirm-dialog__backdrop--exiting' : ''}`}
      backdropTestId="confirm-dialog-backdrop"
      dialogClassName={`confirm-dialog${exiting ? ' confirm-dialog--exiting' : ''}`}
      onClose={onClose}
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
    </Modal>
  )
}
