'use client'

import { useCallback, useEffect, useState, useSyncExternalStore, Fragment } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/apiClient'
import type { Role } from '@/lib/types'

const COLLAPSED_STORAGE_KEY = 'staffBarCollapsed'
const SELECTED_BRANCH_STORAGE_KEY = 'selectedBranchId'
const BRANCH_AWARE_PATHS = ['/dashboard', '/admin/menu-items', '/admin/tables']
const MOBILE_QUERY = '(max-width: 640px)'

type NavLink = { href: string; label: string; adminOnly: boolean }

const NAV_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', adminOnly: false },
  { href: '/admin/menu-items', label: 'Menu Management', adminOnly: false },
  { href: '/admin/tables', label: 'Table Setup', adminOnly: false },
]

const MENU_LINKS: NavLink[] = [
  { href: '/admin/payment-methods', label: 'Payment Methods', adminOnly: true },
  { href: '/admin/branches', label: 'Branches', adminOnly: true },
]

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', callback)
      return () => mql.removeEventListener('change', callback)
    },
    [query],
  )
  // Server always renders the desktop layout; the client re-renders after mount
  // if the viewport is actually narrow. useSyncExternalStore keeps this
  // hydration-safe (no mismatch warning) despite the server/client difference.
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

type StaffBarProps = { role: Role; branches?: { id: string; name: string }[] }

export function StaffBar({ role, branches = [] }: StaffBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const [loggingOut, setLoggingOut] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)

  const showBranchPicker = role === 'admin' && branches.length > 1

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

  useEffect(() => {
    if (!showBranchPicker) return

    const isDashboard = pathname === '/dashboard'
    const urlBranch = searchParams.get('branch')
    const urlIsValid =
      urlBranch !== null && (urlBranch === 'all' ? isDashboard : branches.some((b) => b.id === urlBranch))

    let stored: string | null = null
    try {
      stored = localStorage.getItem(SELECTED_BRANCH_STORAGE_KEY)
    } catch {
      // Storage unavailable — fall through to the page-appropriate default.
    }
    const storedIsValid = stored !== null && (stored === 'all' ? isDashboard : branches.some((b) => b.id === stored))

    const resolved = urlIsValid
      ? (urlBranch as string)
      : storedIsValid
        ? (stored as string)
        : isDashboard
          ? 'all'
          : branches[0].id

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedBranchId(resolved)
    try {
      localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, resolved)
    } catch {
      // Non-critical: the preference just won't survive a reload.
    }

    if (BRANCH_AWARE_PATHS.includes(pathname) && urlBranch !== resolved) {
      router.replace(`${pathname}?branch=${resolved}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, showBranchPicker])

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

  function effectiveBranchIdFor(path: string): string | null {
    if (!selectedBranchId) return null
    if (selectedBranchId !== 'all') return selectedBranchId
    return path === '/dashboard' ? 'all' : (branches[0]?.id ?? null)
  }

  function hrefFor(link: NavLink): string {
    if (!showBranchPicker || !BRANCH_AWARE_PATHS.includes(link.href)) return link.href
    const branchId = effectiveBranchIdFor(link.href)
    return branchId ? `${link.href}?branch=${branchId}` : link.href
  }

  function handleSelectBranch(id: string) {
    setSelectedBranchId(id)
    try {
      localStorage.setItem(SELECTED_BRANCH_STORAGE_KEY, id)
    } catch {
      // Non-critical: the preference just won't survive a reload.
    }
    setBranchPopoverOpen(false)
    setMenuOpen(false)
    if (BRANCH_AWARE_PATHS.includes(pathname)) {
      router.replace(`${pathname}?branch=${id}`)
    }
  }

  const collapseButton = (
    <button
      type="button"
      className="staff-bar__collapse"
      onClick={toggleCollapsed}
      aria-label="Hide staff bar"
    >
      ▴
    </button>
  )

  if (pathname === '/login' || pathname === '/') return null

  if (collapsed) {
    return (
      <div className={`staff-strip staff-strip--${role} staff-strip--collapsed`}>
        <div className="staff-strip__hairline" aria-hidden="true" />
        <button type="button" className="staff-bar__toggle" onClick={toggleCollapsed} aria-label="Show staff bar">
          ▾
        </button>
      </div>
    )
  }

  const visibleNavLinks = NAV_LINKS.filter((link) => !link.adminOnly || role === 'admin')
  const visibleMenuLinks = MENU_LINKS.filter((link) => !link.adminOnly || role === 'admin')
  const selectedBranchLabel =
    selectedBranchId === 'all' ? 'All branches' : (branches.find((b) => b.id === selectedBranchId)?.name ?? '')

  const branchOptions = showBranchPicker
    ? [...(pathname === '/dashboard' ? [{ id: 'all', name: 'All branches' }] : []), ...branches]
    : []

  return (
    <div className={`staff-strip staff-strip--${role}`}>
      <div className="staff-bar">
        {!isMobile && (
          <span className="staff-bar__nav">
            {visibleNavLinks.map((link, index) => (
              <Fragment key={link.href}>
                {index > 0 && (
                  <span className="staff-bar__sep" aria-hidden="true">
                    ·
                  </span>
                )}
                <Link
                  href={hrefFor(link)}
                  className={`staff-bar__action${pathname === link.href ? ' staff-bar__action--active' : ''}`}
                >
                  {link.label}
                </Link>
              </Fragment>
            ))}
          </span>
        )}
        <span className="staff-bar__right">
          {showBranchPicker && (
            <span className="staff-bar__branch">
              <button
                type="button"
                className="staff-bar__branch-button"
                onClick={() => setBranchPopoverOpen((v) => !v)}
                aria-expanded={branchPopoverOpen}
              >
                {selectedBranchLabel} ▾
              </button>
              {branchPopoverOpen && (
                <ul className="staff-bar__branch-popover" role="listbox">
                  {branchOptions.map((branch) => (
                    <li key={branch.id}>
                      <button type="button" onClick={() => handleSelectBranch(branch.id)}>
                        {branch.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </span>
          )}
          <span className="staff-bar__menu">
            <button
              type="button"
              className="staff-bar__hamburger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Hide menu' : 'Show menu'}
            >
              ☰
            </button>
            {menuOpen && (
              <ul className="staff-bar__menu-popover" role="menu">
                {isMobile &&
                  visibleNavLinks.map((link) => (
                    <li key={link.href} role="none">
                      <Link
                        href={hrefFor(link)}
                        role="menuitem"
                        className={`staff-bar__menu-link${pathname === link.href ? ' staff-bar__menu-link--active' : ''}`}
                        onClick={() => setMenuOpen(false)}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}

                {isMobile && visibleMenuLinks.length > 0 && (
                  <li role="none" className="staff-bar__menu-divider" />
                )}
                {visibleMenuLinks.map((link) => (
                  <li key={link.href} role="none">
                    <Link
                      href={link.href}
                      role="menuitem"
                      className={`staff-bar__menu-link${pathname === link.href ? ' staff-bar__menu-link--active' : ''}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {(isMobile || visibleMenuLinks.length > 0) && (
                  <li role="none" className="staff-bar__menu-divider" />
                )}
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="staff-bar__menu-logout"
                    disabled={loggingOut}
                    onClick={handleLogout}
                  >
                    Log out
                  </button>
                </li>
              </ul>
            )}
          </span>
        </span>
      </div>
      {collapseButton}
    </div>
  )
}
