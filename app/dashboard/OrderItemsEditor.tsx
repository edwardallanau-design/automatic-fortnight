'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'
import type { OrderCardItem } from './OrderCard'

export type AvailableMenuItem = { id: string; name: string; price: string }

function lineTotal(item: OrderCardItem): number {
  return Number(item.priceSnapshot) * item.quantity
}

export function OrderItemsEditor({
  items,
  busy,
  menuItems,
  onAddItem,
  onAdjustQuantity,
  onRemoveItem,
}: {
  items: OrderCardItem[]
  busy: boolean
  menuItems: AvailableMenuItem[]
  onAddItem: (menuItemId: string) => void
  onAdjustQuantity: (itemId: string, quantity: number) => void
  onRemoveItem: (itemId: string) => void
}) {
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null)
  const singleLine = items.length === 1

  function handleAdd() {
    if (!selectedMenuItemId) return
    onAddItem(selectedMenuItemId)
    setSelectedMenuItemId('')
  }

  function handleConfirmRemove() {
    if (!confirmRemove) return
    onRemoveItem(confirmRemove.id)
    setConfirmRemove(null)
  }

  return (
    <>
      <ul className="order-items-editor__lines">
        {items.map((item) => (
          <li key={item.id} className="order-items-editor__line">
            <span className="order-items-editor__line-name">{item.nameSnapshot}</span>
            <button
              type="button"
              className="order-items-editor__stepper"
              aria-label={`Decrease ${item.nameSnapshot} quantity`}
              disabled={busy || item.quantity <= 1}
              onClick={() => onAdjustQuantity(item.id, item.quantity - 1)}
            >
              -
            </button>
            <span className="order-items-editor__line-qty">{item.quantity}</span>
            <button
              type="button"
              className="order-items-editor__stepper"
              aria-label={`Increase ${item.nameSnapshot} quantity`}
              disabled={busy}
              onClick={() => onAdjustQuantity(item.id, item.quantity + 1)}
            >
              +
            </button>
            <span className="order-items-editor__line-price">${lineTotal(item).toFixed(2)}</span>
            {!singleLine && (
              <button
                type="button"
                className="order-items-editor__remove"
                aria-label={`Remove ${item.nameSnapshot}`}
                disabled={busy}
                onClick={() => setConfirmRemove({ id: item.id, name: item.nameSnapshot })}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="order-items-editor__add">
        <select
          className="order-items-editor__add-select"
          aria-label="Add an item"
          value={selectedMenuItemId}
          disabled={busy || menuItems.length === 0}
          onChange={(event) => setSelectedMenuItemId(event.target.value)}
        >
          <option value="">Add an item…</option>
          {menuItems.map((menuItem) => (
            <option key={menuItem.id} value={menuItem.id}>
              {menuItem.name} — ${menuItem.price}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="order-items-editor__add-button"
          disabled={busy || !selectedMenuItemId}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove item?"
          message={`Remove ${confirmRemove.name} from this order?`}
          confirmLabel="Remove"
          busy={busy}
          exiting={false}
          onConfirm={handleConfirmRemove}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </>
  )
}
