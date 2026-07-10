'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import type { Role } from '@/lib/types'

const COLLAPSED_STORAGE_KEY = 'staffBarCollapsed'

export function StaffBar({ role }: { role: Role }) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // localStorage doesn't exist during SSR, so the collapsed preference can only be read
    // client-side post-mount — rendering expanded first avoids a hydration mismatch.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true')
    } catch {
      // Storage unavailable — default to expanded.
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next))
      } catch {
        // Non-critical: the preference just won't survive a reload.
      }
      return next
    })
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await apiClient.post('/api/auth/logout', {})
    } catch {
      // Best-effort: even if clearing the session server-side failed, still send the user to /login.
    } finally {
      router.push('/login')
      router.refresh()
      setLoggingOut(false)
    }
  }

  if (collapsed) {
    return (
      <div className="staff-strip staff-strip--collapsed">
        <div className="staff-strip__hairline" aria-hidden="true" />
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          ▾
        </button>
      </div>
    )
  }

  const showDashboardLink = pathname !== '/dashboard'
  const showMenuManagementLink = pathname !== '/admin/menu-items'
  const showTableSetupLink = role === 'admin' && pathname !== '/admin/tables'
  const showPaymentMethodsLink = role === 'admin' && pathname !== '/admin/payment-methods'
  const showSettingsLink = role === 'admin' && pathname !== '/admin/settings'

  return (
    <div className="staff-strip">
      <div className="staff-bar">
        <span className="staff-bar__role">
          <span className="staff-bar__dot" aria-hidden="true" />
          {role}
        </span>
        <span className="staff-bar__actions">
          {showDashboardLink && (
            <>
              <Link href="/dashboard" className="staff-bar__action">
                Dashboard
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          {showMenuManagementLink && (
            <>
              <Link href="/admin/menu-items" className="staff-bar__action">
                Menu Management
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          {showTableSetupLink && (
            <>
              <Link href="/admin/tables" className="staff-bar__action">
                Table Setup
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          {showPaymentMethodsLink && (
            <>
              <Link href="/admin/payment-methods" className="staff-bar__action">
                Payment Methods
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          {showSettingsLink && (
            <>
              <Link href="/admin/settings" className="staff-bar__action">
                Settings
              </Link>
              <span className="staff-bar__sep" aria-hidden="true">
                ·
              </span>
            </>
          )}
          <button
            type="button"
            className="staff-bar__action staff-bar__logout"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            Log out
          </button>
          <button
            type="button"
            className="staff-bar__collapse"
            onClick={toggleCollapsed}
            aria-label="Hide staff bar"
          >
            ▴
          </button>
        </span>
      </div>
    </div>
  )
}
