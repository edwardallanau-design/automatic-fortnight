import type { ReactNode } from 'react'

export type TicketCardLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export function TicketCard({
  heading,
  customerName,
  items,
  statusNote,
  footer,
}: {
  heading: string
  customerName: string | null
  items: TicketCardLine[]
  statusNote: string
  footer?: ReactNode
}) {
  const total = items.reduce((sum, item) => sum + Number(item.priceSnapshot) * item.quantity, 0)

  return (
    <section aria-label="Order confirmation" className="ticket">
      <div className="ticket__stub">
        <span className="ticket__label">Your ticket</span>
        <h2 className="ticket__number">{heading}</h2>
        {customerName && <p className="ticket__customer">For {customerName}</p>}
        <ul className="ticket__lines">
          {items.map((item) => (
            <li key={item.id} className="ticket__line">
              <span className="ticket__line-name">{item.nameSnapshot}</span>
              <span className="ticket__line-qty">x{item.quantity}</span>
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
        {footer}
        <p className="ticket__note">{statusNote}</p>
      </div>
    </section>
  )
}
