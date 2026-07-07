'use client'

export type OrderCardItem = { id: string; nameSnapshot: string; priceSnapshot: string; quantity: number }

export type OrderCardOrder = {
  id: string
  orderNumber: number
  createdAt: string
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
  const badgeLabel =
    order.fulfillmentStatus === 'Pending'
      ? 'Needs confirmation'
      : order.paymentStatus === 'Paid'
        ? 'Paid'
        : 'Unpaid'
  const badgePaid = order.fulfillmentStatus === 'Confirmed' && order.paymentStatus === 'Paid'
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <li className="order-grid__item">
      <button
        type="button"
        className={`order-card${exiting ? ' order-card--exiting' : ''}`}
        aria-label={`Order ${order.orderNumber}, table ${order.table.number}`}
        onClick={onOpen}
      >
        <div className="order-card__head">
          <span className="order-card__table">
            Table {order.table.number}
            {order.customerName && <span className="order-card__customer"> · {order.customerName}</span>}
          </span>
          <span className="order-card__number">#{order.orderNumber}</span>
        </div>
        <span className="order-card__time">{formatTimeAgo(order.createdAt)}</span>
        <span className={`order-card__badge${badgePaid ? ' order-card__badge--paid' : ''}`}>{badgeLabel}</span>
        <span className="order-card__summary">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>
        <span className="order-card__total">${orderTotal(order).toFixed(2)}</span>
      </button>
    </li>
  )
}
