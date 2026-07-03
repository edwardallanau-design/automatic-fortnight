import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { InvalidCredentialError } from '@/lib/errors'

vi.mock('@/lib/authService', () => ({
  login: vi.fn(),
}))

import { login } from '@/lib/authService'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_SECRET = 'test-secret'
  })

  it('returns 200 with role and sets a session cookie on success', async () => {
    vi.mocked(login).mockResolvedValue({ role: 'staff' })

    const res = await POST(makeRequest({ password: 'staff-temp-pw' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ role: 'staff' })
    expect(res.headers.get('set-cookie')).toContain('session=')
  })

  it('returns 401 with no cookie on invalid credential', async () => {
    vi.mocked(login).mockRejectedValue(new InvalidCredentialError('no match'))

    const res = await POST(makeRequest({ password: 'wrong' }))

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'INVALID_CREDENTIAL', message: 'no match' })
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 400 when password is missing', async () => {
    const res = await POST(makeRequest({}))

    expect(res.status).toBe(400)
    expect(login).not.toHaveBeenCalled()
  })
})
