'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { TicketCard, formatPaymentChoiceNote, type PaymentChoice } from './TicketCard'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

export type OrderTicketLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type OrderTicketProps = {
  id: string
  orderNumber: number
  customerName: string | null
  paymentChoice: PaymentChoice
  paymentMethodNameSnapshot: string | null
  paymentReference: string | null
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'
const CONFIRM_EXIT_MS = 200

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  async function cancelOrder() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.del(`/api/orders/${order.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? CONFLICT_MESSAGE : 'Something went wrong. Please try again.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openConfirm() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
    }, CONFIRM_EXIT_MS)
  }

  function handleConfirm() {
    closeConfirm()
    cancelOrder()
  }

  return (
    <>
      <TicketCard
        heading={`Order #${order.orderNumber}`}
        customerName={order.customerName}
        items={order.items}
        statusNote="Contact staff to change your order, or cancel it below."
        paymentNote={formatPaymentChoiceNote(order.paymentChoice, order.paymentMethodNameSnapshot, order.paymentReference)}
        footer={
          <>
            {error && (
              <p role="alert" className="ticket__error">
                {error}
              </p>
            )}
            <button
              type="button"
              className="ticket__cancel"
              disabled={busy}
              onClick={openConfirm}
            >
              Cancel order
            </button>
          </>
        }
      />
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title="Cancel this order?"
          message="Staff won't receive it, and this can't be undone."
          confirmLabel="Yes, cancel"
          busy={busy}
          exiting={!confirmOpen}
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  )
}
