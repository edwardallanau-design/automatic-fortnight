'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '@/app/components/Modal'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import type { Role } from '@/lib/types'
import type { OrderCardItem, OrderCardOrder } from './OrderCard'
import { OrderItemsEditor } from './OrderItemsEditor'
import { Receipt } from './Receipt'

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

const RECEIPT_PAGE_WIDTH_MM = 80
const PX_PER_MM = 96 / 25.4 // CSS px-to-mm at the standard 96dpi CSS reference

// The receipt prints via a portal appended directly to <body>, sibling to the
// rest of the app, so the print stylesheet can hide everything else with
// `display: none` (zero layout height) instead of `visibility: hidden` (which
// keeps the whole dashboard's height reserved and produces a page-sized PDF
// for a slip's worth of content).
function useReceiptPrintTarget(): HTMLElement | null {
  const [target, setTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.id = 'receipt-print-root'
    document.body.appendChild(el)
    setTarget(el)
    return () => {
      document.body.removeChild(el)
    }
  }, [])

  return target
}

// `@page { size: 80mm auto }` (a fixed width, flexible height) is not
// reliably honored outside an interactive print dialog — Chromium's
// programmatic PDF export silently falls back to a full Letter page,
// producing exactly the oversized-printout symptom this is fixing. Instead,
// measure the receipt's actual rendered height right before printing and
// inject a concrete two-dimension @page size that matches it.
function useReceiptPageSize(target: HTMLElement | null) {
  useEffect(() => {
    if (!target) return

    function setPageSize() {
      const heightMm = Math.ceil(target!.getBoundingClientRect().height / PX_PER_MM) + 5
      let styleEl = document.getElementById('receipt-page-size') as HTMLStyleElement | null
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'receipt-page-size'
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = `@page { size: ${RECEIPT_PAGE_WIDTH_MM}mm ${heightMm}mm; margin: 0; }`
    }

    window.addEventListener('beforeprint', setPageSize)
    return () => window.removeEventListener('beforeprint', setPageSize)
  }, [target])
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
  const printTarget = useReceiptPrintTarget()
  useReceiptPageSize(printTarget)

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
          {order.orderingPoint.label} · #{order.orderNumber}
        </h2>
        {order.customerName && <p className="order-detail-modal__customer">{order.customerName}</p>}

        {order.paymentChoice !== 'None' && (
          <div className="order-detail-modal__payment-note">
            <span className="order-detail-modal__payment-note-label">
              {order.paymentStatus === 'Paid' ? 'Paid' : 'Awaiting payment'} ·{' '}
              {order.paymentChoice === 'Counter' ? 'Counter' : `Online (${order.paymentMethodNameSnapshot})`}
            </span>
            {order.paymentChoice === 'Online' && (
              <span className="order-detail-modal__payment-note-reference">ref: {order.paymentReference}</span>
            )}
          </div>
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
          <button
            type="button"
            className="order-detail-modal__print"
            disabled={order.paymentStatus !== 'Paid'}
            title={order.paymentStatus !== 'Paid' ? 'Available once paid' : undefined}
            onClick={() => window.print()}
          >
            Print receipt
          </button>
        </div>
      </Modal>

      {printTarget &&
        createPortal(
          <Receipt
            branchName={order.branch.name}
            orderingPointLabel={order.orderingPoint.label}
            orderNumber={order.orderNumber}
            customerName={order.customerName}
            items={order.items}
            paymentChoice={order.paymentChoice}
            paymentMethodNameSnapshot={order.paymentMethodNameSnapshot}
            paymentReference={order.paymentReference}
          />,
          printTarget,
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
    </>
  )
}
