'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { TicketCard } from './TicketCard'
import { ConfirmDialog } from './ConfirmDialog'

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
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'
const CONFIRM_EXIT_MS = 200

type ConfirmAction = { type: 'remove'; itemId: string; name: string } | { type: 'cancel' }

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const singleLine = order.items.length === 1

  async function mutate(path: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await apiClient.del(path)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? CONFLICT_MESSAGE : 'Something went wrong. Please try again.')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function openConfirm(action: ConfirmAction) {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmAction(action)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirm() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
      setConfirmAction(null)
    }, CONFIRM_EXIT_MS)
  }

  function handleConfirm() {
    if (!confirmAction) return
    const path =
      confirmAction.type === 'cancel'
        ? `/api/orders/${order.id}`
        : `/api/orders/${order.id}/items/${confirmAction.itemId}`
    closeConfirm()
    mutate(path)
  }

  return (
    <>
      <TicketCard
        heading={`Order #${order.orderNumber} confirmed`}
        customerName={order.customerName}
        busy={busy}
        items={order.items.map((item) => ({
          ...item,
          onRemove: singleLine
            ? undefined
            : () => openConfirm({ type: 'remove', itemId: item.id, name: item.nameSnapshot }),
        }))}
        statusNote="Remove items or cancel while your order is still pending."
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
              onClick={() => openConfirm({ type: 'cancel' })}
            >
              Cancel order
            </button>
          </>
        }
      />
      {confirmAction && (confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={confirmAction.type === 'cancel' ? 'Cancel this order?' : 'Remove item?'}
          message={
            confirmAction.type === 'cancel'
              ? "Staff won't receive it, and this can't be undone."
              : `Remove ${confirmAction.name} from your order?`
          }
          confirmLabel={confirmAction.type === 'cancel' ? 'Yes, cancel' : 'Remove'}
          busy={busy}
          exiting={!confirmOpen}
          onConfirm={handleConfirm}
          onClose={closeConfirm}
        />
      )}
    </>
  )
}
