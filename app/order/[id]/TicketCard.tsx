import type { ReactNode } from 'react'

export type TicketCardLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type PaymentChoice = 'None' | 'Counter' | 'Online'

export function formatPaymentChoiceNote(
  paymentChoice: PaymentChoice,
  paymentMethodNameSnapshot: string | null,
  paymentReference: string | null,
): string | null {
  if (paymentChoice === 'Counter') return 'You chose to pay at the counter.'
  if (paymentChoice === 'Online') {
    return `You chose to pay online via ${paymentMethodNameSnapshot}. Reference: ${paymentReference}.`
  }
  return null
}

export function TicketCard({
  heading,
  customerName,
  items,
  statusNote,
  paymentNote,
  footer,
}: {
  heading: string
  customerName: string | null
  items: TicketCardLine[]
  statusNote: string
  paymentNote?: string | null
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
        {paymentNote && <p className="ticket__note">{paymentNote}</p>}
        <p className="ticket__note">{statusNote}</p>
      </div>
    </section>
  )
}
