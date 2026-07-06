'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { OrderReviewModal } from './OrderReviewModal'

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
  const [cartExpanded, setCartExpanded] = useState(false)
  const [toast, setToast] = useState<{ menuItemId: string; name: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  function showToast(menuItemId: string, name: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ menuItemId, name })
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
  }

  function undoToast() {
    if (!toast) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    adjustQuantity(toast.menuItemId, -1)
    setToast(null)
  }

  const router = useRouter()

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
    showToast(item.id, item.name)
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
      const order = await apiClient.post<{ id: string }>('/api/orders', {
        tableId,
        items: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
      })
      router.push(`/order/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  const categories = categorize(items)
  const cartCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const cartTotal = lines.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0)

  return (
    <>
      {toast && (
        <div className="cart-toast" role="status">
          <span>Added {toast.name} to cart</span>
          <button type="button" className="cart-toast__undo" onClick={undoToast}>
            Undo
          </button>
        </div>
      )}
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

        <div className={`cart-summary${!cartExpanded ? ' cart-summary--collapsed' : ''}`}>
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
          {error && !reviewOpen && (
            <p role="alert" className="cart-summary__error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="cart-summary__submit"
            onClick={() => setReviewOpen(true)}
            disabled={lines.length === 0 || submitting}
          >
            Submit order
          </button>
        </div>
      </section>

      {reviewOpen && (
        <OrderReviewModal
          lines={lines}
          total={cartTotal}
          error={error}
          submitting={submitting}
          onConfirm={handleSubmit}
          onClose={() => {
            if (!submitting) {
              setReviewOpen(false)
              setError(null)
            }
          }}
        />
      )}
    </>
  )
}
