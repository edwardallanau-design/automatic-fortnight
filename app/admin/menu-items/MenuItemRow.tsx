'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type MenuItemRowProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
}

export function MenuItemRow({ id, name, price, available, editable }: MenuItemRowProps) {
  const router = useRouter()
  const [editName, setEditName] = useState(name)
  const [editPrice, setEditPrice] = useState(price)
  const [editAvailable, setEditAvailable] = useState(available)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}`, {
        name: editName,
        price: Number(editPrice),
        available: editAvailable,
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleArchive() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.del(`/api/menu-items/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!editable) {
    return (
      <li>
        <span>{name}</span> — <span>${price}</span> —{' '}
        <span>{available ? 'Available' : 'Sold out'}</span>
      </li>
    )
  }

  return (
    <li>
      <input value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={`Name for ${name}`} />
      <input
        type="number"
        step="0.01"
        min="0.01"
        value={editPrice}
        onChange={(e) => setEditPrice(e.target.value)}
        aria-label={`Price for ${name}`}
      />
      <label>
        <input
          type="checkbox"
          checked={editAvailable}
          onChange={(e) => setEditAvailable(e.target.checked)}
        />
        Available
      </label>
      <button type="button" onClick={handleSave} disabled={submitting}>
        Save
      </button>
      <button type="button" onClick={handleArchive} disabled={submitting}>
        Archive
      </button>
      {error && <p role="alert">{error}</p>}
    </li>
  )
}
