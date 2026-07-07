'use client'

import { Modal } from '@/app/components/Modal'

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
  return (
    <Modal
      ariaLabel="Review your order"
      backdropClassName={`review-modal__backdrop${exiting ? ' review-modal__backdrop--exiting' : ''}`}
      backdropTestId="review-modal-backdrop"
      dialogClassName={`review-modal${exiting ? ' review-modal--exiting' : ''}`}
      onClose={onClose}
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
    </Modal>
  )
}
