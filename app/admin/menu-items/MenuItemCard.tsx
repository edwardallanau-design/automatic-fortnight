'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

const CONFIRM_EXIT_MS = 200

type MenuItemCardProps = {
  id: string
  name: string
  price: string
  available: boolean
  editable: boolean
  branchId: string
  categoryId?: string | null
  categories?: { id: string; name: string }[]
}

export function MenuItemCard({
  id,
  name,
  price,
  available,
  editable,
  branchId,
  categoryId = null,
  categories = [],
}: MenuItemCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [editPrice, setEditPrice] = useState(price)
  const [editCategoryId, setEditCategoryId] = useState(categoryId ?? '')
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
    confirmCloseTimerRef.current = setTimeout(() => setConfirmClosing(false), CONFIRM_EXIT_MS)
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
    setEditCategoryId(categoryId ?? '')
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setEditPrice(price)
    setEditCategoryId(categoryId ?? '')
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
        categoryId: editCategoryId === '' ? null : editCategoryId,
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
      await apiClient.patch(`/api/menu-items/${id}/availability`, { available: next, branchId })
      router.refresh()
    } catch (err) {
      setCheckedAvailable(!next)
      setAvailabilityError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setAvailabilitySubmitting(false)
    }
  }

  const availabilityToggle = (
    <label className="slider-toggle menu-item-card__toggle">
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
      <div className="menu-item-card">
        <div className="menu-item-card__row">
          {editable ? (
            <button
              type="button"
              className="menu-item-card__view menu-item-card__view--editable"
              onClick={startEditing}
              aria-label={`Edit ${name}`}
            >
              <span className="menu-item-card__name">{name}</span>
              <span className="menu-item-card__price">${price}</span>
            </button>
          ) : (
            <div className="menu-item-card__view">
              <span className="menu-item-card__name">{name}</span>
              <span className="menu-item-card__price">${price}</span>
            </div>
          )}
          {availabilityToggle}
        </div>
        {availabilityError && (
          <p role="alert" className="menu-item-card__error">
            {availabilityError}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="menu-item-card menu-item-card--editing">
      <div className="menu-item-card__form">
        <input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          aria-label={`Name for ${name}`}
          className="menu-item-card__input menu-item-card__input--name"
        />
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={editPrice}
          onChange={(e) => setEditPrice(e.target.value)}
          aria-label={`Price for ${name}`}
          className="menu-item-card__input menu-item-card__input--price"
        />
        <select
          value={editCategoryId}
          onChange={(e) => setEditCategoryId(e.target.value)}
          aria-label={`Category for ${name}`}
          className="menu-item-card__select"
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <div className="menu-item-card__actions">
          <button type="button" className="menu-item-card__save" onClick={handleSave} disabled={submitting}>
            Save
          </button>
          <button type="button" className="menu-item-card__cancel" onClick={cancelEditing} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="menu-item-card__archive" onClick={openConfirmArchive} disabled={submitting}>
            Archive
          </button>
        </div>
        {error && (
          <p role="alert" className="menu-item-card__error">
            {error}
          </p>
        )}
        {availabilityError && (
          <p role="alert" className="menu-item-card__error">
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
    </div>
  )
}
