'use client'

import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'

const TOTAL_PULSE_MS = 500

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderTicketPane({
  order,
  editable,
  busy,
  settleBlockedByPendingAdd,
  error,
  onAdjustQuantity,
  onRemoveItem,
  onConfirm,
  onCancelOrder,
  onSetPaymentStatus,
  onPrint,
}: {
  order: OrderCardOrder
  editable: boolean
  busy: boolean
  settleBlockedByPendingAdd: boolean
  error: string | null
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onConfirm: () => void
  onCancelOrder: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onPrint: () => void
}) {
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const singleLine = order.items.length === 1
  const settleActionsDisabled = busy || settleBlockedByPendingAdd

  const total = order.items.reduce((sum, item) => sum + lineTotal(item), 0)

  // Signature moment (design spec D6/visual design): adds are optimistic with no network delay to
  // signal a tap landed, so the total pulses on change as the durable feedback that it registered.
  const [pulsing, setPulsing] = useState(false)
  const previousTotalRef = useRef(total)
  useEffect(() => {
    if (previousTotalRef.current === total) return
    previousTotalRef.current = total
    setPulsing(true)
    const timer = setTimeout(() => setPulsing(false), TOTAL_PULSE_MS)
    return () => clearTimeout(timer)
  }, [total])

  function handleConfirmRemove() {
    if (!confirmRemove) return
    onRemoveItem(confirmRemove.id)
    setConfirmRemove(null)
  }

  function handleCancelConfirm() {
    setCancelConfirmOpen(false)
    onCancelOrder()
  }

  return (
    <div className="order-detail-ticket">
      <div className="order-detail-ticket__lines">
        {editable ? (
          <ul className="order-items-editor__lines">
            {order.items.map((item) => (
              <li key={item.id} className="order-items-editor__line">
                <span className="order-items-editor__line-name">{item.nameSnapshot}</span>
                <button
                  type="button"
                  className="order-items-editor__stepper"
                  aria-label={`Decrease ${item.nameSnapshot} quantity`}
                  disabled={busy || item.quantity <= 1}
                  onClick={() => onAdjustQuantity(item.id, item.quantity - 1)}
                >
                  -
                </button>
                <span className="order-items-editor__line-qty">{item.quantity}</span>
                <button
                  type="button"
                  className="order-items-editor__stepper"
                  aria-label={`Increase ${item.nameSnapshot} quantity`}
                  disabled={busy}
                  onClick={() => onAdjustQuantity(item.id, item.quantity + 1)}
                >
                  +
                </button>
                <span className="order-items-editor__line-price">${lineTotal(item).toFixed(2)}</span>
                {!singleLine && (
                  <button
                    type="button"
                    className="order-items-editor__remove"
                    aria-label={`Remove ${item.nameSnapshot}`}
                    disabled={busy}
                    onClick={() => setConfirmRemove({ id: item.id, name: item.nameSnapshot })}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
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
        )}
      </div>

      <div className={`order-detail-modal__total${pulsing ? ' order-detail-modal__total--pulse' : ''}`}>
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
          <button type="button" className="order-detail-modal__confirm" disabled={settleActionsDisabled} onClick={onConfirm}>
            Confirm order
          </button>
        )}
        {order.fulfillmentStatus === 'Pending' && (
          <button
            type="button"
            className="order-detail-modal__cancel"
            disabled={settleActionsDisabled}
            onClick={() => setCancelConfirmOpen(true)}
          >
            Cancel order
          </button>
        )}
        {order.paymentStatus === 'Unpaid' ? (
          <button
            type="button"
            className="order-detail-modal__pay"
            disabled={settleActionsDisabled}
            onClick={() => onSetPaymentStatus('Paid')}
          >
            Mark Paid
          </button>
        ) : (
          <button
            type="button"
            className="order-detail-modal__pay order-detail-modal__pay--revert"
            disabled={settleActionsDisabled}
            onClick={() => onSetPaymentStatus('Unpaid')}
          >
            Mark Unpaid
          </button>
        )}
        <button
          type="button"
          className="order-detail-modal__print"
          disabled={order.paymentStatus !== 'Paid' || settleBlockedByPendingAdd}
          title={order.paymentStatus !== 'Paid' ? 'Available once paid' : undefined}
          onClick={onPrint}
        >
          Print receipt
        </button>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove item?"
          message={`Remove ${confirmRemove.name} from this order?`}
          confirmLabel="Remove"
          busy={busy}
          exiting={false}
          onConfirm={handleConfirmRemove}
          onClose={() => setConfirmRemove(null)}
        />
      )}

      {cancelConfirmOpen && (
        <ConfirmDialog
          title="Cancel this order?"
          message="Staff won't receive it, and this can't be undone."
          confirmLabel="Yes, cancel"
          busy={busy}
          exiting={false}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelConfirmOpen(false)}
        />
      )}
    </div>
  )
}
