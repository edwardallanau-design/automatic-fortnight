'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type PaymentMethodRowProps = {
  id: string
  name: string
  accountInfo: string | null
  qrImageUrl: string | null
  active: boolean
  editable: boolean
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function PaymentMethodRow({ id, name, accountInfo, qrImageUrl, active, editable }: PaymentMethodRowProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editAccountInfo, setEditAccountInfo] = useState(accountInfo ?? '')
  const [pendingQrImage, setPendingQrImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [checkedActive, setCheckedActive] = useState(active)
  const [activeSubmitting, setActiveSubmitting] = useState(false)
  const [activeError, setActiveError] = useState<string | null>(null)

  async function handleActiveChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setCheckedActive(next)
    setActiveError(null)
    setActiveSubmitting(true)
    try {
      await apiClient.patch(`/api/payment-methods/${id}`, { active: next })
      router.refresh()
    } catch (err) {
      setCheckedActive(!next)
      setActiveError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setActiveSubmitting(false)
    }
  }

  function startEditing() {
    setEditName(name)
    setEditAccountInfo(accountInfo ?? '')
    setPendingQrImage(null)
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setEditAccountInfo(accountInfo ?? '')
    setPendingQrImage(null)
    setError(null)
    setIsEditing(false)
  }

  async function handleQrImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setPendingQrImage(await toBase64(file))
    } catch {
      setError('Could not read that image. Please try a different file.')
    }
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/payment-methods/${id}`, {
        name: editName,
        accountInfo: editAccountInfo,
        ...(pendingQrImage ? { qrImage: pendingQrImage } : {}),
      })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const activeToggle = (
    <label className="slider-toggle">
      <input
        type="checkbox"
        role="switch"
        className="slider-toggle__input"
        checked={checkedActive}
        disabled={activeSubmitting}
        onChange={handleActiveChange}
        aria-label={`Active: ${name}`}
      />
      <span className="slider-toggle__track" aria-hidden="true" />
      <span className="slider-toggle__label">{checkedActive ? 'Active' : 'Inactive'}</span>
    </label>
  )

  if (!editable || !isEditing) {
    return (
      <li className="payment-method-admin-row">
        <div className="payment-method-admin-row__view">
          {qrImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImageUrl} alt={`${name} QR code`} className="payment-method-admin-row__qr-preview" />
          )}
          <span className="payment-method-admin-row__name">{name}</span>
          {activeToggle}
          {editable && (
            <button type="button" className="payment-method-admin-row__edit" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
        {activeError && (
          <p role="alert" className="payment-method-admin-row__error">
            {activeError}
          </p>
        )}
      </li>
    )
  }

  return (
    <li className="payment-method-admin-row">
      <div className="payment-method-admin-row__form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          aria-label={`Name for ${name}`}
          className="payment-method-admin-row__input payment-method-admin-row__input--name"
        />
        <input
          value={editAccountInfo}
          onChange={(e) => setEditAccountInfo(e.target.value)}
          aria-label={`Account info for ${name}`}
          placeholder="Account/wallet number (optional)"
          className="payment-method-admin-row__input payment-method-admin-row__input--account"
        />
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`QR image for ${name}`}
          onChange={handleQrImageChange}
        />
        {activeToggle}
        <div className="payment-method-admin-row__actions">
          <button type="button" className="payment-method-admin-row__save" onClick={handleSave} disabled={submitting}>
            Save
          </button>
          <button type="button" className="payment-method-admin-row__cancel" onClick={cancelEditing} disabled={submitting}>
            Cancel
          </button>
        </div>
        {error && (
          <p role="alert" className="payment-method-admin-row__error">
            {error}
          </p>
        )}
        {activeError && (
          <p role="alert" className="payment-method-admin-row__error">
            {activeError}
          </p>
        )}
      </div>
    </li>
  )
}
