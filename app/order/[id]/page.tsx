import { getOrderById } from '@/lib/orderService'
import { NotFoundError } from '@/lib/errors'
import { OrderTicket, type OrderTicketProps } from './OrderTicket'

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

  if (order.fulfillmentStatus === 'Cancelled') {
    return (
      <main className="order-page">
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
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      priceSnapshot: item.priceSnapshot.toString(),
      quantity: item.quantity,
    })),
  }

  if (order.fulfillmentStatus === 'Confirmed') {
    const total = ticket.items.reduce(
      (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
      0,
    )
    return (
      <main className="order-page">
        <section aria-label="Order confirmation" className="ticket">
          <div className="ticket__stub">
            <span className="ticket__label">Your ticket</span>
            <h2 className="ticket__number">Order #{ticket.orderNumber} confirmed</h2>
            <ul className="ticket__lines">
              {ticket.items.map((item) => (
                <li key={item.id} className="ticket__line">
                  <span>
                    {item.nameSnapshot} x{item.quantity}
                  </span>
                  <span className="ticket__line-price">
                    ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="ticket__total">
              <span>Total</span>
              <span className="ticket__total-price">${total.toFixed(2)}</span>
            </div>
            <p className="ticket__note">Confirmed by staff — ask staff to change anything.</p>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="order-page">
      <OrderTicket order={ticket} />
    </main>
  )
}
