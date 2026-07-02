import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleApiError } from './handleApiError'
import { ValidationError, InvalidCredentialError, NotFoundError, ConflictError, ForbiddenError } from './errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleApiError', () => {
  it('maps ValidationError to 400', async () => {
    const res = handleApiError(new ValidationError('bad input'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'VALIDATION_ERROR', message: 'bad input' })
  })

  it('maps InvalidCredentialError to 401', async () => {
    const res = handleApiError(new InvalidCredentialError('no match'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'INVALID_CREDENTIAL_ERROR', message: 'no match' })
  })

  it('maps NotFoundError to 404', async () => {
    const res = handleApiError(new NotFoundError('missing'))
    expect(res.status).toBe(404)
  })

  it('maps ConflictError to 409', async () => {
    const res = handleApiError(new ConflictError('conflict'))
    expect(res.status).toBe(409)
  })

  it('maps ForbiddenError to 403', async () => {
    const res = handleApiError(new ForbiddenError('forbidden'))
    expect(res.status).toBe(403)
  })

  it('maps unknown errors to 500 without leaking details', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = handleApiError(new Error('raw db error: connection string leaked'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'INTERNAL_ERROR', message: 'Something went wrong' })
    expect(consoleSpy).toHaveBeenCalledOnce()
  })
})
