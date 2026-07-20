'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { ConfirmDialog } from '@/app/components/ConfirmDialog'

const CONFIRM_EXIT_MS = 200

type CategoryHeaderProps = {
  id: string
  name: string
  interactive: boolean
}

export function CategoryHeader({ id, name, interactive }: CategoryHeaderProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmClosing, setConfirmClosing] = useState(false)
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    }
  }, [])

  function openConfirmDelete() {
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    setConfirmOpen(true)
    setConfirmClosing(false)
  }

  function closeConfirmDelete() {
    setConfirmOpen(false)
    setConfirmClosing(true)
    if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current)
    confirmCloseTimerRef.current = setTimeout(() => setConfirmClosing(false), CONFIRM_EXIT_MS)
  }

  async function handleDelete() {
    closeConfirmDelete()
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.del(`/api/categories/${id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEditing() {
    setEditName(name)
    setError(null)
    setIsEditing(true)
  }

  function cancelEditing() {
    setEditName(name)
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    setError(null)
    setSubmitting(true)
    try {
      await apiClient.patch(`/api/categories/${id}`, { name: editName })
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!interactive) {
    return <h2 className="menu-category__title">{name}</h2>
  }

  if (!isEditing) {
    return (
      <h2 className="menu-category__title menu-category__title--editable">
        <button type="button" className="menu-category__edit" onClick={startEditing} aria-label={`Edit ${name}`}>
          {name}
        </button>
      </h2>
    )
  }

  return (
    <div className="menu-category__editor">
      <input
        value={editName}
        onChange={(e) => setEditName(e.target.value)}
        aria-label={`Name for ${name}`}
        className="menu-category__input"
      />
      <div className="menu-category__actions">
        <button type="button" className="menu-category__save" onClick={handleSave} disabled={submitting}>
          Save
        </button>
        <button type="button" className="menu-category__cancel" onClick={cancelEditing} disabled={submitting}>
          Cancel
        </button>
        <button type="button" className="menu-category__delete" onClick={openConfirmDelete} disabled={submitting}>
          Delete
        </button>
      </div>
      {error && (
        <p role="alert" className="menu-category__error">
          {error}
        </p>
      )}
      {(confirmOpen || confirmClosing) && (
        <ConfirmDialog
          title={`Delete ${name}?`}
          message="Items in this category will become uncategorized."
          confirmLabel="Delete"
          busy={submitting}
          exiting={!confirmOpen}
          onConfirm={handleDelete}
          onClose={closeConfirmDelete}
        />
      )}
    </div>
  )
}
