'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export type OrderTicketLine = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

export type OrderTicketProps = {
  id: string
  orderNumber: number
  items: OrderTicketLine[]
}

const CONFLICT_MESSAGE = 'This order was just confirmed by staff and can no longer be changed.'

export function OrderTicket({ order }: { order: OrderTicketProps }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const total = order.items.reduce(
    (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
    0,
  )
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

  return (
    <section aria-label="Order confirmation" className="ticket">
      <div className="ticket__stub">
        <span className="ticket__label">Your ticket</span>
        <h2 className="ticket__number">Order #{order.orderNumber} confirmed</h2>
        <ul className="ticket__lines">
          {order.items.map((item) => (
            <li key={item.id} className="ticket__line">
              <span>
                {item.nameSnapshot} x{item.quantity}
              </span>
              <span className="ticket__line-price">
                ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
              </span>
              {!singleLine && (
                <button
                  type="button"
                  className="ticket__remove"
                  aria-label={`Remove ${item.nameSnapshot}`}
                  disabled={busy}
                  onClick={() => mutate(`/api/orders/${order.id}/items/${item.id}`)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="ticket__total">
          <span>Total</span>
          <span className="ticket__total-price">${total.toFixed(2)}</span>
        </div>
        {error && (
          <p role="alert" className="ticket__error">
            {error}
          </p>
        )}
        <button
          type="button"
          className="ticket__cancel"
          disabled={busy}
          onClick={() => mutate(`/api/orders/${order.id}`)}
        >
          Cancel order
        </button>
        <p className="ticket__note">Remove items or cancel while your order is still pending.</p>
      </div>
    </section>
  )
}
