'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await apiClient.post('/api/auth/login', { password })
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError) {
        setError('Incorrect password')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <span className="login-card__eyebrow">Staff Access</span>
        <h1 className="login-card__title">Welcome back</h1>
        <form onSubmit={handleSubmit}>
          <label htmlFor="password" className="login-card__label">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="login-card__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="login-card__submit" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
          {error && (
            <p role="alert" className="login-card__error">
              {error}
            </p>
          )}
        </form>
      </div>
    </main>
  )
}
