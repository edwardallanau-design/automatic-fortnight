'use client'

import { useEffect } from 'react'

type ReviewLine = {
  menuItemId: string
  name: string
  price: string
  quantity: number
}

export function OrderReviewModal({
  lines,
  total,
  error,
  submitting,
  onConfirm,
  onClose,
}: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
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
    <div className="review-modal__backdrop" data-testid="review-modal-backdrop" onClick={onClose}>
      <div
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Review your order"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="review-modal__title">Review your order</h2>
        <ul className="review-modal__lines">
          {lines.map((line) => (
            <li key={line.menuItemId} className="review-modal__line">
              <span className="review-modal__line-name">
                {line.quantity}x {line.name}
              </span>
              <span className="review-modal__line-price">
                ${(Number(line.price) * line.quantity).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="review-modal__total">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
        {error && (
          <p role="alert" className="review-modal__error">
            {error}
          </p>
        )}
        <div className="review-modal__actions">
          <button type="button" className="review-modal__back" onClick={onClose} disabled={submitting}>
            Back to menu
          </button>
          <button type="button" className="review-modal__confirm" onClick={onConfirm} disabled={submitting}>
            Confirm Order
          </button>
        </div>
      </div>
    </div>
  )
}
