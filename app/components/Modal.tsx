'use client'

import { useEffect, type ReactNode } from 'react'

export function Modal({
  ariaLabel,
  backdropClassName,
  backdropTestId,
  dialogClassName,
  onClose,
  children,
}: {
  ariaLabel: string
  backdropClassName: string
  backdropTestId: string
  dialogClassName: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={backdropClassName} data-testid={backdropTestId} onClick={onClose}>
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
