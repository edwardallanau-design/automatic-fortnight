'use client'

import { useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'

type MenuItemProps = {
  id: string
  name: string
  price: string
  available: boolean
}

type CartLine = {
  menuItemId: string
  name: string
  price: string
  quantity: number
}

type OrderConfirmationItem = {
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

type OrderConfirmation = {
  orderNumber: number
  items: OrderConfirmationItem[]
}

export function Cart({ tableId, items }: { tableId: string; items: MenuItemProps[] }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null)

  function addItem(item: MenuItemProps) {
    setLines((prev) => {
      const existing = prev.find((line) => line.menuItemId === item.id)
      if (existing) {
        return prev.map((line) =>
          line.menuItemId === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }]
    })
  }

  function adjustQuantity(menuItemId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((line) => (line.menuItemId === menuItemId ? { ...line, quantity: line.quantity + delta } : line))
        .filter((line) => line.quantity > 0),
    )
  }

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      const order = await apiClient.post<OrderConfirmation>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      })
      setConfirmation(order)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (confirmation) {
    const total = confirmation.items.reduce(
      (sum, item) => sum + Number(item.priceSnapshot) * item.quantity,
      0,
    )
    return (
      <section aria-label="Order confirmation">
        <h2>Order #{confirmation.orderNumber} confirmed</h2>
        <ul>
          {confirmation.items.map((item, index) => (
            <li key={index}>
              {item.nameSnapshot} x{item.quantity} — ${(Number(item.priceSnapshot) * item.quantity).toFixed(2)}
            </li>
          ))}
        </ul>
        <p>Total: ${total.toFixed(2)}</p>
        <p>Ask staff if you need to change anything.</p>
      </section>
    )
  }

  return (
    <>
      <ul className="menu-list">
        {items.map((item) => (
          <li key={item.id} className="menu-list__item">
            <button
              type="button"
              className="menu-item-button"
              disabled={!item.available}
              onClick={() => addItem(item)}
            >
              <span className="menu-item-button__name">{item.name}</span>
              <span className="menu-item-button__price">${item.price}</span>
            </button>
          </li>
        ))}
      </ul>

      <section aria-label="Your order">
        <h2>Your order</h2>
        {lines.length === 0 ? (
          <p>Your cart is empty.</p>
        ) : (
          <ul>
            {lines.map((line) => (
              <li key={line.menuItemId}>
                <span>{line.name}</span>
                <button
                  type="button"
                  aria-label={`Decrease ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, -1)}
                >
                  -
                </button>
                <span>{line.quantity}</span>
                <button
                  type="button"
                  aria-label={`Increase ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, 1)}
                >
                  +
                </button>
                <span>${(Number(line.price) * line.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert">{error}</p>}
        <button type="button" onClick={handleSubmit} disabled={lines.length === 0 || submitting}>
          Submit order
        </button>
      </section>
    </>
  )
}
