'use client'

import { Modal } from '@/app/components/Modal'
import { formatTableLabel } from '@/lib/tableDisplay'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderDetailModal({
  order,
  busy,
  error,
  exiting,
  onConfirm,
  onSetPaymentStatus,
  onClose,
}: {
  order: OrderCardOrder
  busy: boolean
  error: string | null
  exiting: boolean
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onClose: () => void
}) {
  const total = order.items.reduce((sum, item) => sum + lineTotal(item), 0)

  return (
    <Modal
      ariaLabel={`Order ${order.orderNumber}`}
      backdropClassName={`order-detail-modal__backdrop${exiting ? ' order-detail-modal__backdrop--exiting' : ''}`}
      backdropTestId="order-detail-modal-backdrop"
      dialogClassName={`order-detail-modal${exiting ? ' order-detail-modal--exiting' : ''}`}
      onClose={onClose}
    >
      <h2 className="order-detail-modal__title">
        {formatTableLabel(order.table.number)} · #{order.orderNumber}
      </h2>
      {order.customerName && <p className="order-detail-modal__customer">{order.customerName}</p>}

      <ul className="order-detail-modal__lines">
        {order.items.map((item) => (
          <li key={item.id} className="order-detail-modal__line">
            <span className="order-detail-modal__line-name">
              {item.quantity}x {item.nameSnapshot}
            </span>
            <span className="order-detail-modal__line-price">${lineTotal(item).toFixed(2)}</span>
          </li>
        ))}
      </ul>

      <div className="order-detail-modal__total">
        <span>Total</span>
        <span>${total.toFixed(2)}</span>
      </div>

      {error && (
        <p role="alert" className="order-detail-modal__error">
          {error}
        </p>
      )}

      <div className="order-detail-modal__actions">
        {order.fulfillmentStatus === 'Pending' && (
          <button type="button" className="order-detail-modal__confirm" disabled={busy} onClick={onConfirm}>
            Confirm order
          </button>
        )}
        {order.paymentStatus === 'Unpaid' ? (
          <button
            type="button"
            className="order-detail-modal__pay"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Paid')}
          >
            Mark Paid
          </button>
        ) : (
          <button
            type="button"
            className="order-detail-modal__pay order-detail-modal__pay--revert"
            disabled={busy}
            onClick={() => onSetPaymentStatus('Unpaid')}
          >
            Mark Unpaid
          </button>
        )}
      </div>
    </Modal>
  )
}
