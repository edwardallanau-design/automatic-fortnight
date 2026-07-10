'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreatePaymentMethodForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [accountInfo, setAccountInfo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/payment-methods', { name, accountInfo })
      setName('')
      setAccountInfo('')
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="admin-panel__form">
      <div>
        <label htmlFor="pm-name" className="admin-panel__label">
          Name
        </label>
        <input
          id="pm-name"
          type="text"
          className="admin-panel__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="pm-account-info" className="admin-panel__label">
          Account / wallet number (optional)
        </label>
        <input
          id="pm-account-info"
          type="text"
          className="admin-panel__input"
          value={accountInfo}
          onChange={(e) => setAccountInfo(e.target.value)}
        />
      </div>
      <button type="submit" className="admin-panel__submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add payment method'}
      </button>
      {error && (
        <p role="alert" className="admin-panel__error">
          {error}
        </p>
      )}
    </form>
  )
}
