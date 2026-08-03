'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'

export type OrderEventListItem = {
  id: string
  action: string
  actorRole: 'customer' | 'staff' | 'admin'
  createdAt: string
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  confirmed: 'Confirmed',
  unconfirmed: 'Unconfirmed',
  cancelled: 'Cancelled',
  marked_paid: 'Marked Paid',
  marked_unpaid: 'Marked Unpaid',
  payment_choice_set: 'Payment choice set',
  item_added: 'Item added',
  item_removed: 'Item removed',
  item_quantity_changed: 'Item quantity changed',
}

function formatAction(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function formatTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// A disputed ticket can be reconstructed from this list -- staff/admin only, oldest first, no
// customer-facing exposure. Orders that predate this feature simply render an empty list; there is
// no backfill (per spec).
export function OrderHistory({ orderId }: { orderId: string }) {
  const [events, setEvents] = useState<OrderEventListItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get<OrderEventListItem[]>(`/api/orders/${orderId}/events`)
      .then((result) => {
        if (!cancelled) setEvents(result)
      })
      .catch(() => {
        if (!cancelled) setEvents([])
      })
    return () => {
      cancelled = true
    }
  }, [orderId])

  if (events === null) return null

  return (
    <div className="order-detail-modal__history">
      <h3 className="order-detail-modal__history-title">History</h3>
      {events.length === 0 ? (
        <p className="order-detail-modal__history-empty">No history recorded for this order.</p>
      ) : (
        <ul className="order-detail-modal__history-list">
          {events.map((event) => (
            <li key={event.id} className="order-detail-modal__history-item">
              <span className="order-detail-modal__history-action">{formatAction(event.action)}</span>
              <span className="order-detail-modal__history-actor">{event.actorRole}</span>
              <span className="order-detail-modal__history-time">{formatTimestamp(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
