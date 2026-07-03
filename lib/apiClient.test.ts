import { describe, it, expect, vi, afterEach } from 'vitest'
import { apiClient, ApiError } from './apiClient'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('apiClient.post', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ role: 'staff' }),
    }))

    const result = await apiClient.post('/api/auth/login', { password: 'x' })
    expect(result).toEqual({ role: 'staff' })
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'x' }),
      credentials: 'include',
    })
  })

  it('throws ApiError with code/message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'INVALID_CREDENTIAL', message: 'Incorrect password' }),
    }))

    await expect(apiClient.post('/api/auth/login', { password: 'wrong' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIAL', message: 'Incorrect password' })
  })

  it('ApiError is an instance of Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'VALIDATION', message: 'bad input' }),
    }))

    try {
      await apiClient.post('/api/auth/login', {})
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
    }
  })
})

describe('apiClient.patch', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'm1', available: false }),
    }))

    const result = await apiClient.patch('/api/menu-items/m1', { available: false })
    expect(result).toEqual({ id: 'm1', available: false })
    expect(fetch).toHaveBeenCalledWith('/api/menu-items/m1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: false }),
      credentials: 'include',
    })
  })

  it('throws ApiError with code/message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'NOT_FOUND', message: 'Menu item not found' }),
    }))

    await expect(apiClient.patch('/api/menu-items/missing', { available: false }))
      .rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Menu item not found' })
  })
})

describe('apiClient.del', () => {
  it('resolves with no value on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

    await expect(apiClient.del('/api/menu-items/m1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/menu-items/m1', {
      method: 'DELETE',
      credentials: 'include',
    })
  })

  it('throws ApiError with code/message on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'FORBIDDEN', message: 'Insufficient role for this action' }),
    }))

    await expect(apiClient.del('/api/menu-items/m1'))
      .rejects.toMatchObject({ code: 'FORBIDDEN', message: 'Insufficient role for this action' })
  })
})
