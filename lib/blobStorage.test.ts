import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { uploadQrImage } from './blobStorage'
import { ValidationError } from './errors'
import { put } from '@vercel/blob'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('blobStorage.uploadQrImage', () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
  })

  afterEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = originalToken
  })

  it('uploads a valid PNG data URL and returns the blob URL', async () => {
    vi.mocked(put).mockResolvedValue({ url: 'https://blob.example/payment-methods/p1-abc.png' } as never)

    const result = await uploadQrImage('p1', `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`)

    expect(result).toBe('https://blob.example/payment-methods/p1-abc.png')
    expect(put).toHaveBeenCalledWith(
      'payment-methods/p1.png',
      expect.any(Buffer),
      { access: 'public', contentType: 'image/png', addRandomSuffix: true },
    )
  })

  it('throws ValidationError for a non-data-URL string', async () => {
    await expect(uploadQrImage('p1', 'not-a-data-url')).rejects.toThrow(ValidationError)
    expect(put).not.toHaveBeenCalled()
  })

  it('throws ValidationError when BLOB_READ_WRITE_TOKEN is not set', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN

    await expect(
      uploadQrImage('p1', `data:image/png;base64,${ONE_PIXEL_PNG_BASE64}`),
    ).rejects.toThrow(ValidationError)
    expect(put).not.toHaveBeenCalled()
  })

  it('throws ValidationError when the decoded image exceeds 2MB', async () => {
    const bigBase64 = Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')

    await expect(uploadQrImage('p1', `data:image/png;base64,${bigBase64}`)).rejects.toThrow(ValidationError)
    expect(put).not.toHaveBeenCalled()
  })
})
