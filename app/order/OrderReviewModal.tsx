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
  exiting,
  customerName,
  onCustomerNameChange,
  onConfirm,
  onClose,
}: {
  lines: ReviewLine[]
  total: number
  error: string | null
  submitting: boolean
  exiting: boolean
  customerName: string
  onCustomerNameChange: (value: string) => void
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
      className={`review-modal__backdrop${exiting ? ' review-modal__backdrop--exiting' : ''}`}
      data-testid="review-modal-backdrop"
      onClick={onClose}
    >
      <div
        className={`review-modal${exiting ? ' review-modal--exiting' : ''}`}
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
        <div className="review-modal__name">
          <label className="review-modal__name-label" htmlFor="order-customer-name">
            Name for this order
          </label>
          <input
            id="order-customer-name"
            type="text"
            className="review-modal__name-input"
            value={customerName}
            maxLength={50}
            placeholder="e.g. Alex"
            disabled={submitting}
            onChange={(event) => onCustomerNameChange(event.target.value)}
          />
          <p className="review-modal__name-hint">Add a name so we can find you</p>
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
