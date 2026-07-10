'use client'

import { useState } from 'react'
import { Modal } from '@/app/components/Modal'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import { formatTableLabel } from '@/lib/tableDisplay'
import type { Role } from '@/lib/types'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'
import { OrderItemsEditor } from './OrderItemsEditor'

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderDetailModal({
  order,
  role = 'staff',
  busy,
  error,
  exiting,
  menuItems,
  onConfirm,
  onSetPaymentStatus,
  onCancelOrder,
  onAddItem,
  onAdjustQuantity,
  onRemoveItem,
  onClose,
}: {
  order: OrderCardOrder
  role?: Role
  busy: boolean
  error: string | null
  exiting: boolean
  menuItems: { id: string; name: string; price: string }[]
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onCancelOrder: () => void
  onAddItem: (menuItemId: string) => void
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onClose: () => void
}) {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const total = order.items.reduce((sum, item) => sum + lineTotal(item), 0)
  const editable = order.fulfillmentStatus === 'Pending' || (order.fulfillmentStatus === 'Confirmed' && role === 'admin')

  function handleCancelConfirm() {
    setCancelConfirmOpen(false)
    onCancelOrder()
  }

  return (
    <>
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

        {order.paymentChoice !== 'None' && (
          <p className="order-detail-modal__payment-note">
            {order.paymentStatus === 'Paid' ? 'Paid' : 'Awaiting payment'} ·{' '}
            {order.paymentChoice === 'Counter'
              ? 'Counter'
              : `Online (${order.paymentMethodNameSnapshot}) · ref: ${order.paymentReference}`}
          </p>
        )}

        {editable ? (
          <OrderItemsEditor
            items={order.items}
            busy={busy}
            menuItems={menuItems}
            onAddItem={onAddItem}
            onAdjustQuantity={onAdjustQuantity}
            onRemoveItem={onRemoveItem}
          />
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
          {order.fulfillmentStatus === 'Pending' && (
            <button
              type="button"
              className="order-detail-modal__cancel"
              disabled={busy}
              onClick={() => setCancelConfirmOpen(true)}
            >
              Cancel order
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
    </>
  )
}
