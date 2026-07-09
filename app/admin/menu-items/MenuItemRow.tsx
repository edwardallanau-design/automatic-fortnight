'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

const CONFIRM_EXIT_MS = 200

type MenuItemRowProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
}

export function MenuItemRow({ id, name, price, available, editable }: MenuItemRowProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editPrice, setEditPrice] = useState(price)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [checkedAvailable, setCheckedAvailable] = useState(available)
  const [availabilitySubmitting, setAvailabilitySubmitting] = useState(false)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  function openConfirmArchive() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirmArchive() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => {
      setConfirmClosing(false)
    }, CONFIRM_EXIT_MS)
  }

  async function handleArchive() {
    closeConfirmArchive()
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

  function startEditing() {
    setEditName(name)
    setEditPrice(price)
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setEditPrice(price)
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}`, {
        name: editName,
        price: Number(editPrice),
      })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAvailabilityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setCheckedAvailable(next)
    setAvailabilityError(null)
    setAvailabilitySubmitting(true)
    try {
      await apiClient.patch(`/api/menu-items/${id}/availability`, { available: next })
      router.refresh()
    } catch (err) {
      setCheckedAvailable(!next)
      setAvailabilityError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setAvailabilitySubmitting(false)
    }
  }

  const availabilityToggle = (
    <label className="slider-toggle">
      <input
        type="checkbox"
        role="switch"
        className="slider-toggle__input"
        checked={checkedAvailable}
        disabled={availabilitySubmitting}
        onChange={handleAvailabilityChange}
        aria-label={`Available: ${name}`}
      />
      <span className="slider-toggle__track" aria-hidden="true" />
      <span className="slider-toggle__label">{checkedAvailable ? 'Available' : 'Sold out'}</span>
    </label>
  )

  if (!editable || !isEditing) {
    return (
      <li className="menu-admin-row">
        <div className="menu-admin-row__view">
          <span className="menu-admin-row__name">{name}</span>
          <span className="menu-admin-row__price">${price}</span>
          {availabilityToggle}
          {editable && (
            <button type="button" className="menu-admin-row__edit" onClick={startEditing}>
              Edit
            </button>
          )}
        </div>
        {availabilityError && (
          <p role="alert" className="menu-admin-row__error">
            {availabilityError}
          </p>
        )}
      </li>
    )
  }

  return (
    <li className="menu-admin-row">
      <div className="menu-admin-row__form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          aria-label={`Name for ${name}`}
          className="menu-admin-row__input menu-admin-row__input--name"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          aria-label={`Price for ${name}`}
          className="menu-admin-row__input menu-admin-row__input--price"
        />
        {availabilityToggle}
        <div className="menu-admin-row__actions">
          <button type="button" className="menu-admin-row__save" onClick={handleSave} disabled={submitting}>
            Save
          </button>
          <button type="button" className="menu-admin-row__cancel" onClick={cancelEditing} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="menu-admin-row__archive" onClick={openConfirmArchive} disabled={submitting}>
            Archive
          </button>
        </div>
        {error && (
          <p role="alert" className="menu-admin-row__error">
            {error}
          </p>
        )}
        {availabilityError && (
          <p role="alert" className="menu-admin-row__error">
            {availabilityError}
          </p>
        )}
      </div>
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={`Archive ${name}?`}
          message="It'll be hidden from the menu."
          confirmLabel="Archive"
          busy={submitting}
          exiting={!confirmOpen}
          onConfirm={handleArchive}
          onClose={closeConfirmArchive}
        />
      )}
    </li>
  )
}
