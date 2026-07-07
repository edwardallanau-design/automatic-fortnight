import Link from 'next/link'
import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'
import type { OrderTicketProps } from './OrderTicket'
import { OrderStatusPoller } from './OrderStatusPoller'
import { TicketCard } from './TicketCard'

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let order
  try {
    order = await getOrderById(id)
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="order-page">
          <p role="alert" className="order-page__error">
            We couldn&apos;t find that order. Please ask staff for help.
          </p>
        </main>
      )
    }
    throw error
  }

  const header = (
    <header className="order-header">
      <div className="order-header__row">
        <span className="order-header__eyebrow">Your order</span>
        <Link href={`/order?table=${order.table.id}`} className="order-header__back">
          ← Menu
        </Link>
      </div>
      <h1 className="order-header__title">Table {order.table.number}</h1>
    </header>
  )

  if (order.fulfillmentStatus === 'Cancelled') {
    return (
      <main className="order-page">
        {header}
        <section aria-label="Order cancelled" className="ticket">
          <div className="ticket__stub">
            <h2 className="ticket__number">Order #{order.orderNumber}</h2>
            <p className="ticket__note">This order was cancelled.</p>
          </div>
        </section>
      </main>
    )
  }

  const ticket: OrderTicketProps = {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      priceSnapshot: item.priceSnapshot.toString(),
      quantity: item.quantity,
    })),
  }

  if (order.fulfillmentStatus === 'Confirmed') {
    return (
      <main className="order-page">
        {header}
        <TicketCard
          heading={`Order #${ticket.orderNumber} confirmed`}
          customerName={ticket.customerName}
          items={ticket.items}
          statusNote="Confirmed by staff — ask staff to change anything."
        />
      </main>
    )
  }

  return (
    <main className="order-page">
      {header}
      <OrderStatusPoller order={ticket} />
    </main>
  )
}
