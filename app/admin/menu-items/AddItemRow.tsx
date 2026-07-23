'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function AddItemRow({ categoryId }: { categoryId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName('')
    setPrice('')
    setError(null)
  }

  async function handleAdd() {
    setError(null)
    setSubmitting(true)

    let created: { id: string }
    try {
      created = await apiClient.post<{ id: string }>('/api/menu-items', { name, price: Number(price) })
    } catch (err) {
      // The item was never created — a plain retry is safe.
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    // The item now exists. Assign its category as a second step; if THAT fails,
    // collapse and refresh anyway so the (uncategorized) item is visible and the
    // admin re-files it rather than blindly re-adding — which would duplicate it.
    if (categoryId !== null) {
      try {
        await apiClient.patch(`/api/menu-items/${created.id}`, { categoryId })
      } catch {
        reset()
        setOpen(false)
        setSubmitting(false)
        router.refresh()
        return
      }
    }

    reset()
    setOpen(false)
    setSubmitting(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className="menu-add-row" onClick={() => setOpen(true)}>
        + Add item
      </button>
    )
  }

  return (
    <div className="menu-add-row menu-add-row--open">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New item name"
        placeholder="Name"
        className="menu-add-row__input menu-add-row__input--name"
      />
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        aria-label="New item price"
        placeholder="Price"
        className="menu-add-row__input menu-add-row__input--price"
      />
      <button type="button" className="menu-add-row__save" onClick={handleAdd} disabled={submitting}>
        Add
      </button>
      <button
        type="button"
        className="menu-add-row__cancel"
        onClick={() => {
          reset()
          setOpen(false)
        }}
        disabled={submitting}
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="menu-add-row__error">
          {error}
        </p>
      )}
    </div>
  )
}
