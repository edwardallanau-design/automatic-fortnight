'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'
import { OrderTicket, type OrderTicketProps } from './OrderTicket'
import { TicketCard, formatPaymentChoiceNote } from './TicketCard'

const POLL_INTERVAL_MS = 3500

type FulfillmentStatus = 'Pending' | 'Confirmed' | 'Cancelled'
type StatusResponse = { fulfillmentStatus: FulfillmentStatus }

export function OrderStatusPoller({ order }: { order: OrderTicketProps }) {
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>('Pending')

  useEffect(() => {
    if (fulfillmentStatus !== 'Pending') return

    let cancelled = false

    async function poll() {
      try {
        const result = await apiClient.get<StatusResponse>(`/api/orders/${order.id}/status`)
        if (!cancelled) setFulfillmentStatus(result.fulfillmentStatus)
      } catch {
        // Transient poll failure: keep the current status, retry next tick.
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [fulfillmentStatus, order.id])

  if (fulfillmentStatus === 'Confirmed') {
    return (
      <TicketCard
        heading={`Order #${order.orderNumber} confirmed`}
        customerName={order.customerName}
        items={order.items}
        statusNote="Confirmed by staff — ask staff to change anything."
        paymentNote={formatPaymentChoiceNote(order.paymentChoice, order.paymentMethodNameSnapshot, order.paymentReference)}
      />
    )
  }

  if (fulfillmentStatus === 'Cancelled') {
    return (
      <section aria-label="Order cancelled" className="ticket">
        <div className="ticket__stub">
          <h2 className="ticket__number">Order #{order.orderNumber}</h2>
          <p className="ticket__note">This order was cancelled.</p>
        </div>
      </section>
    )
  }

  return <OrderTicket order={order} />
}
