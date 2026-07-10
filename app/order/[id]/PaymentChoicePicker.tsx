'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

export type PaymentMethodOption = {
  id: string
  name: string
  qrImageUrl: string | null
  accountInfo: string | null
}

export function PaymentChoicePicker({
  orderId,
  paymentMethods,
}: {
  orderId: string
  paymentMethods: PaymentMethodOption[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'choose' | 'online'>('choose')
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function chooseCounter() {
    setError(null)
    setBusy(true)
    try {
      await apiClient.post(`/api/orders/${orderId}/payment-choice/counter`, {})
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  async function submitOnline(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMethodId) {
      setError('Please select a payment method')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await apiClient.post(`/api/orders/${orderId}/payment-choice/online`, {
        paymentMethodId: selectedMethodId,
        reference,
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  if (mode === 'choose') {
    return (
      <section aria-label="Choose how to pay" className="payment-choice">
        <h2 className="payment-choice__title">How would you like to pay?</h2>
        <div className="payment-choice__options">
          <button type="button" className="payment-choice__option" disabled={busy} onClick={chooseCounter}>
            Pay at counter
          </button>
          {paymentMethods.length > 0 && (
            <button
              type="button"
              className="payment-choice__option"
              disabled={busy}
              onClick={() => setMode('online')}
            >
              Pay online
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="payment-choice__error">
            {error}
          </p>
        )}
      </section>
    )
  }

  return (
    <section aria-label="Pay online" className="payment-choice">
      <h2 className="payment-choice__title">Pay online</h2>
      <form onSubmit={submitOnline} className="payment-choice__form">
        <div className="payment-choice__methods" role="radiogroup" aria-label="Payment method">
          {paymentMethods.map((method) => (
            <label
              key={method.id}
              className={`payment-choice__method${selectedMethodId === method.id ? ' payment-choice__method--selected' : ''}`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method.id}
                checked={selectedMethodId === method.id}
                onChange={() => setSelectedMethodId(method.id)}
                className="payment-choice__method-input"
              />
              {method.qrImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={method.qrImageUrl} alt={`${method.name} QR code`} className="payment-choice__qr" />
              )}
              <span className="payment-choice__method-name">{method.name}</span>
              {method.accountInfo && <span className="payment-choice__account">{method.accountInfo}</span>}
            </label>
          ))}
        </div>
        <label htmlFor="reference" className="payment-choice__label">
          Reference number
        </label>
        <input
          id="reference"
          type="text"
          className="payment-choice__input"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
        />
        <div className="payment-choice__actions">
          <button type="button" className="payment-choice__back" disabled={busy} onClick={() => setMode('choose')}>
            Back
          </button>
          <button type="submit" className="payment-choice__submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit'}
          </button>
        </div>
        {error && (
          <p role="alert" className="payment-choice__error">
            {error}
          </p>
        )}
      </form>
    </section>
  )
}
