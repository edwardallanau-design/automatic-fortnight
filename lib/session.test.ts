import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { signSession, verifySession } from './session'

describe('session', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.AUTH_SECRET
  })

  it('signs and verifies a role round-trip', () => {
    const token = signSession('admin')
    const result = verifySession(token)
    expect(result).toEqual({ role: 'admin' })
  })

  it('signs and verifies a role + branchId round-trip', () => {
    const token = signSession('staff', 'branch-1')
    const result = verifySession(token)
    expect(result).toEqual({ role: 'staff', branchId: 'branch-1' })
  })

  it('omits branchId from the result when the session has none (e.g. admin)', () => {
    const token = signSession('admin')
    const result = verifySession(token)
    expect(result).toEqual({ role: 'admin' })
  })

  it('returns null for an invalid token', () => {
    expect(verifySession('not-a-real-token')).toBeNull()
  })

  it('returns null for a token signed with a different secret', () => {
    const token = signSession('staff')
    process.env.AUTH_SECRET = 'different-secret'
    expect(verifySession(token)).toBeNull()
  })
})
