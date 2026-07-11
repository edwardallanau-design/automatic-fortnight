'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type BranchRowProps = {
  id: string
  name: string
  acceptingOrders: boolean
}

export function BranchRow({ id, name, acceptingOrders }: BranchRowProps) {
  const router = useRouter()

  const [checked, setChecked] = useState(acceptingOrders)
  const [toggleSubmitting, setToggleSubmitting] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [expanded, setExpanded] = useState(false)
  const [editingField, setEditingField] = useState<'name' | 'password' | null>(null)

  const [newName, setNewName] = useState(name)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked
    setChecked(next)
    setToggleError(null)
    setToggleSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { acceptingOrders: next })
      router.refresh()
    } catch (err) {
      setChecked(!next)
      setToggleError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setToggleSubmitting(false)
    }
  }

  function handleToggleExpanded() {
    setExpanded((current) => {
      const next = !current
      if (!next) setEditingField(null)
      return next
    })
  }

  function handleChangeNameClick() {
    setNewName(name)
    setRenameError(null)
    setEditingField('name')
  }

  function handleChangePasswordClick() {
    setNewPassword('')
    setPasswordError(null)
    setEditingField('password')
  }

  async function handleSaveName() {
    setRenameError(null)
    setRenameSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { name: newName })
      setEditingField(null)
      router.refresh()
    } catch (err) {
      setRenameError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setRenameSubmitting(false)
    }
  }

  async function handleSavePassword() {
    setPasswordError(null)
    setPasswordSubmitting(true)
    try {
      await apiClient.patch(`/api/branches/${id}`, { password: newPassword })
      setEditingField(null)
      setNewPassword('')
      router.refresh()
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <li className="branch-row">
      <div className="branch-row__header">
        <span className="branch-row__name">{name}</span>
        <div className="branch-row__header-controls">
          <label className="slider-toggle">
            <input
              type="checkbox"
              role="switch"
              className="slider-toggle__input"
              checked={checked}
              disabled={toggleSubmitting}
              onChange={handleToggle}
              aria-label={`Accepting orders: ${name}`}
            />
            <span className="slider-toggle__track" aria-hidden="true" />
            <span className="slider-toggle__label">{checked ? 'Accepting orders' : 'Not accepting orders'}</span>
          </label>
          <button
            type="button"
            className="branch-row__expand"
            onClick={handleToggleExpanded}
            aria-label={expanded ? `Hide actions for ${name}` : `Show actions for ${name}`}
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
      </div>
      {toggleError && (
        <p role="alert" className="admin-panel__error">
          {toggleError}
        </p>
      )}
      {expanded && (
        <div className="branch-row__actions">
          <button
            type="button"
            className={`branch-row__action${editingField === 'name' ? ' branch-row__action--active' : ''}`}
            onClick={handleChangeNameClick}
          >
            Change name
          </button>
          <button
            type="button"
            className={`branch-row__action${editingField === 'password' ? ' branch-row__action--active' : ''}`}
            onClick={handleChangePasswordClick}
          >
            Change password
          </button>
        </div>
      )}
      {editingField === 'name' && (
        <div className="branch-row__edit-form">
          <label htmlFor={`rename-${id}`} className="admin-panel__label">
            New name for {name}
          </label>
          <input
            id={`rename-${id}`}
            className="admin-panel__input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="button" className="menu-admin-row__edit" onClick={handleSaveName} disabled={renameSubmitting}>
            Save name
          </button>
        </div>
      )}
      {renameError && (
        <p role="alert" className="admin-panel__error">
          {renameError}
        </p>
      )}
      {editingField === 'password' && (
        <div className="branch-row__edit-form">
          <label htmlFor={`password-${id}`} className="admin-panel__label">
            New password for {name}
          </label>
          <input
            id={`password-${id}`}
            type="password"
            className="admin-panel__input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button type="button" className="menu-admin-row__edit" onClick={handleSavePassword} disabled={passwordSubmitting}>
            Save password
          </button>
        </div>
      )}
      {passwordError && (
        <p role="alert" className="admin-panel__error">
          {passwordError}
        </p>
      )}
    </li>
  )
}
