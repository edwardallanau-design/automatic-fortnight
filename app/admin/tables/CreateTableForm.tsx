'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export function CreateTableForm() {
  const router = useRouter()
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/tables', { number: Number(number) })
      setNumber('')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONFLICT') {
        setError('A table with that number already exists')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="number">Table number</label>
      <input
        id="number"
        type="number"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add table'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
