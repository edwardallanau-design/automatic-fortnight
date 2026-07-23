'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Modal } from '@/app/components/Modal'
import type { Role } from '@/lib/types'
import type { OrderCardOrder } from './OrderCard'
import { MenuItemPicker } from './MenuItemPicker'
import type { PickerItem } from './MenuItemPicker'
import { OrderTicketPane } from './OrderTicketPane'
import { Receipt } from './Receipt'

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
  settleBlockedByPendingAdd,
  error,
  exiting,
  pickerGroups,
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
  settleBlockedByPendingAdd: boolean
  error: string | null
  exiting: boolean
  pickerGroups: Array<{ id: string; name: string; items: PickerItem[] }>
  onConfirm: () => void
  onSetPaymentStatus: (paymentStatus: 'Paid' | 'Unpaid') => void
  onCancelOrder: () => void
  onAddItem: (menuItemId: string) => void
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
  onClose: () => void
}) {
  const [activePane, setActivePane] = useState<'order' | 'add'>('order')
  const printTarget = useReceiptPrintTarget()
  useReceiptPageSize(printTarget)

  const editable = order.fulfillmentStatus === 'Pending' || (order.fulfillmentStatus === 'Confirmed' && role === 'admin')

  return (
    <>
      <Modal
        ariaLabel={`Order ${order.orderNumber}`}
        backdropClassName={`order-detail-modal__backdrop${exiting ? ' order-detail-modal__backdrop--exiting' : ''}`}
        backdropTestId="order-detail-modal-backdrop"
        dialogClassName={`order-detail-modal${editable ? ' order-detail-modal--wide' : ''}${exiting ? ' order-detail-modal--exiting' : ''}`}
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

        {editable && (
          <div className="order-detail-modal__pane-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              className={`order-detail-modal__pane-toggle-btn${activePane === 'order' ? ' order-detail-modal__pane-toggle-btn--active' : ''}`}
              aria-selected={activePane === 'order'}
              onClick={() => setActivePane('order')}
            >
              Order
            </button>
            <button
              type="button"
              role="tab"
              className={`order-detail-modal__pane-toggle-btn${activePane === 'add' ? ' order-detail-modal__pane-toggle-btn--active' : ''}`}
              aria-selected={activePane === 'add'}
              onClick={() => setActivePane('add')}
            >
              Add items
            </button>
          </div>
        )}

        <div className="order-detail-modal__panes" data-pane={activePane}>
          {editable && <MenuItemPicker groups={pickerGroups} disabled={busy} onAdd={onAddItem} />}
          <OrderTicketPane
            order={order}
            editable={editable}
            busy={busy}
            settleBlockedByPendingAdd={settleBlockedByPendingAdd}
            error={error}
            onAdjustQuantity={onAdjustQuantity}
            onRemoveItem={onRemoveItem}
            onConfirm={onConfirm}
            onCancelOrder={onCancelOrder}
            onSetPaymentStatus={onSetPaymentStatus}
            onPrint={() => window.print()}
          />
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
    </>
  )
}
