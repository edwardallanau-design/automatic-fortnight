'use client'

import { formatTableLabel } from '@/lib/tableDisplay'

export type OrderCardItem = { id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }

export type OrderCardOrder = {
  id: string
  orderNumber: number
  createdAt: string
  confirmedAt?: string | null
  fulfillmentStatus: 'Pending' | 'Confirmed'
  paymentStatus: 'Unpaid' | 'Paid'
  customerName: string | null
  table: { number: number }
  items: OrderCardItem[]
}

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

function formatTimestamp(confirmedAt: string): string {
  return new Date(confirmedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function orderTotal(order: OrderCardOrder): number {
  return order.items.reduce((sum, item) => sum + Number(item.priceSnapshot) * item.quantity, 0)
}

export function OrderCard({
  order,
  exiting,
  onOpen,
}: {
  order: OrderCardOrder
  exiting: boolean
  onOpen: () => void
}) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const timeLabel =
    order.fulfillmentStatus === 'Confirmed' && order.confirmedAt
      ? formatTimestamp(order.confirmedAt)
      : formatTimeAgo(order.createdAt)

  return (
    <li className="order-grid__item">
      <button
        type="button"
        className={`order-card${exiting ? ' order-card--exiting' : ''}`}
        aria-label={`Order ${order.orderNumber}, ${formatTableLabel(order.table.number)}`}
        onClick={onOpen}
      >
        <span className="order-card__stub">#{order.orderNumber}</span>
        <span className="order-card__table">
          {formatTableLabel(order.table.number)}
          {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
        </span>
        <span className="order-card__meta">
          <span className="order-card__time">{timeLabel}</span>
          <span className="order-card__summary">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </span>
          <span className={`order-card__badge${order.paymentStatus === 'Paid' ? ' order-card__badge--paid' : ''}`}>
            {order.paymentStatus}
          </span>
        </span>
        <span className="order-card__total">${orderTotal(order).toFixed(2)}</span>
      </button>
    </li>
  )
}
