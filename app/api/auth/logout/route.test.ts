import { describe, it, expect } from 'vitest'
import { POST } from './route'
import { SESSION_COOKIE_NAME } from '@/lib/session'

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears the session cookie', async () => {
    const res = await POST()

    expect(res.status).toBe(200)
    const cookieHeader = res.headers.get('set-cookie') ?? ''
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=;`)
    expect(cookieHeader.toLowerCase()).toContain('max-age=0')
  })
})
