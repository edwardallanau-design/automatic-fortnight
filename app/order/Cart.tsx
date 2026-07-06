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

const CATEGORIES: { label: string; match: RegExp }[] = [
  { label: 'Brewed & Tea', match: /drip coffee|cold brew|chai|matcha|tea/i },
  { label: 'Espresso Drinks', match: /espresso|americano|cappuccino|latte|flat white|mocha|macchiato/i },
  { label: 'Pastries', match: /croissant|muffin|cinnamon roll|cookie|banana bread|scone|pain au chocolat/i },
  { label: 'Light Bites', match: /toast|sandwich|parfait|bagel/i },
]
const OTHER_CATEGORY = 'More'

function categorize(items: MenuItemProps[]) {
  const groups = new Map<string, MenuItemProps[]>()
  for (const item of items) {
    const category = CATEGORIES.find((c) => c.match.test(item.name))?.label ?? OTHER_CATEGORY
    const group = groups.get(category) ?? []
    group.push(item)
    groups.set(category, group)
  }
  const order = [...CATEGORIES.map((c) => c.label), OTHER_CATEGORY]
  return order
    .filter((label) => groups.has(label))
    .map((label) => ({ label, items: groups.get(label)! }))
}

export function Cart({ tableId, items }: { tableId: string; items: MenuItemProps[] }) {
  const [lines, setLines] = useState<CartLine[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null)
  const [cartExpanded, setCartExpanded] = useState(false)

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
    if (submitting) return
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
      <section aria-label="Order confirmation" className="ticket">
        <div className="ticket__stub">
          <span className="ticket__label">Your ticket</span>
          <h2 className="ticket__number">Order #{confirmation.orderNumber} confirmed</h2>
          <ul className="ticket__lines">
            {confirmation.items.map((item, index) => (
              <li key={index} className="ticket__line">
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
          <p className="ticket__note">Ask staff if you need to change anything.</p>
        </div>
      </section>
    )
  }

  const categories = categorize(items)
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotal = lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0)

  return (
    <>
      <div className="menu-categories">
        {categories.map((category) => (
          <div key={category.label} className="menu-category">
            <h2 className="menu-category__title">{category.label}</h2>
            <ul className="menu-list">
              {category.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="menu-item-button"
                    disabled={!item.available}
                    onClick={() => addItem(item)}
                  >
                    <span>
                      <span className="menu-item-button__name">{item.name}</span>
                      {!item.available && <span className="menu-item-button__sold-out">Sold out</span>}
                    </span>
                    <span className="menu-item-button__price">${item.price}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <section aria-label="Your order" className="cart-rail">
        <button
          type="button"
          className="cart-rail__toggle"
          onClick={() => setCartExpanded((prev) => !prev)}
          disabled={lines.length === 0}
          aria-expanded={lines.length === 0 ? undefined : cartExpanded}
        >
          <span className="cart-rail__summary">
            {lines.length === 0 ? (
              <span className="cart-rail__hint">Your cart is empty</span>
            ) : (
              <>
                <span className="cart-rail__count">{cartCount} item{cartCount === 1 ? '' : 's'}</span>
                <span>Your order</span>
              </>
            )}
          </span>
          {lines.length > 0 && (
            <span>
              <span className="cart-rail__total">${cartTotal.toFixed(2)}</span>
              <span className="cart-rail__chevron">{cartExpanded ? '▾' : '▸'}</span>
            </span>
          )}
        </button>

        <div className={`cart-summary${lines.length > 0 && !cartExpanded ? ' cart-summary--collapsed' : ''}`}>
          <ul className="cart-summary__lines">
            {lines.map((line) => (
              <li key={line.menuItemId} className="cart-summary__line">
                <span className="cart-summary__line-name">{line.name}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Decrease ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, -1)}
                >
                  -
                </button>
                <span className="cart-summary__line-qty">{line.quantity}</span>
                <button
                  type="button"
                  className="cart-summary__stepper"
                  aria-label={`Increase ${line.name} quantity`}
                  onClick={() => adjustQuantity(line.menuItemId, 1)}
                >
                  +
                </button>
                <span className="cart-summary__line-price">${(Number(line.price) * line.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="cart-summary__error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="cart-summary__submit"
            onClick={handleSubmit}
            disabled={lines.length === 0 || submitting}
          >
            Submit order
          </button>
        </div>
      </section>
    </>
  )
}
