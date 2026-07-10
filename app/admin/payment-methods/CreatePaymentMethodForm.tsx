'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { toBase64 } from './toBase64'

export function CreatePaymentMethodForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [accountInfo, setAccountInfo] = useState('')
  const [pendingQrImage, setPendingQrImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleQrImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPendingQrImage(await toBase64(file))
    } catch {
      setError('Could not read that image. Please try a different file.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    let created: { id: string }
    try {
      created = await apiClient.post<{ id: string }>('/api/payment-methods', { name, accountInfo })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }

    const qrImage = pendingQrImage
    setName('')
    setAccountInfo('')
    setPendingQrImage(null)
    router.refresh()

    if (qrImage) {
      try {
        await apiClient.patch(`/api/payment-methods/${created.id}`, { qrImage })
        router.refresh()
      } catch (err) {
        setError(
          `Payment method created, but the QR image failed to upload (${
            err instanceof ApiError ? err.message : 'something went wrong'
          }). Edit it to retry.`,
        )
      }
    }

    setSubmitting(false)
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
      <div>
        <label htmlFor="pm-qr-image" className="admin-panel__label">
          QR image (optional)
        </label>
        <input
          id="pm-qr-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleQrImageChange}
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
