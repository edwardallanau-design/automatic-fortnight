'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function AddCategoryRow() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.post('/api/categories', { name })
      setName('')
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="menu-add-row menu-add-row--category" onClick={() => setOpen(true)}>
        + Add category
      </button>
    )
  }

  return (
    <div className="menu-add-row menu-add-row--open menu-add-row--category">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="New category name"
        placeholder="Category name"
        className="menu-add-row__input menu-add-row__input--name"
      />
      <button type="button" className="menu-add-row__save" onClick={handleAdd} disabled={submitting}>
        Add
      </button>
      <button
        type="button"
        className="menu-add-row__cancel"
        onClick={() => {
          setName('')
          setError(null)
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
