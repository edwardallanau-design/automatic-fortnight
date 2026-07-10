'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateOrderingPointForm() {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/ordering-points', { label })
      setLabel('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('A table with that label already exists')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-panel__form">
      <div>
        <label htmlFor="label" className="admin-panel__label">
          Table label
        </label>
        <input
          id="label"
          type="text"
          className="admin-panel__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add table'}
      </button>
      {error && (
        <p role="alert" className="admin-panel__error">
          {error}
        </p>
      )}
    </form>
  )
}
