'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type AcceptingOrdersToggleProps = {
  acceptingOrders: boolean
}

export function AcceptingOrdersToggle({ acceptingOrders }: AcceptingOrdersToggleProps) {
  const router = useRouter()
  const [checked, setChecked] = useState(acceptingOrders)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setChecked(next)
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch('/api/venue-settings', { acceptingOrders: next })
      router.refresh()
    } catch (err) {
      setChecked(!next)
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin-panel__form">
      <label className="slider-toggle">
        <input
          type="checkbox"
          role="switch"
          className="slider-toggle__input"
          checked={checked}
          disabled={submitting}
          onChange={handleChange}
          aria-label="Accepting orders"
        />
        <span className="slider-toggle__track" aria-hidden="true" />
        <span className="slider-toggle__label">
          {checked ? 'Accepting orders' : 'Not accepting orders'}
        </span>
      </label>
      {error && (
        <p role="alert" className="admin-panel__error">
          {error}
        </p>
      )}
    </div>
  )
}
