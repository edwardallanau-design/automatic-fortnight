import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCookieGet, mockRedirect } = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookieGet }),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireRole } from './authGuard'
import { signSession, SESSION_COOKIE_NAME } from './session'

describe('requireRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns the session role when a valid staff cookie exists and staff is required', async () => {
    const token = signSession('staff')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireRole('staff')
    expect(result).toEqual({ role: 'staff' })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('allows admin to satisfy a staff-level requirement', async () => {
    const token = signSession('admin')
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: token })

    const result = await requireRole('staff')
    expect(result).toEqual({ role: 'admin' })
  })

  it('redirects to /login when no cookie is present', async () => {
    mockCookieGet.mockReturnValue(undefined)

    await expect(requireRole('staff')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when the cookie is invalid', async () => {
    mockCookieGet.mockReturnValue({ name: SESSION_COOKIE_NAME, value: 'garbage' })

    await expect(requireRole('staff')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })
})
