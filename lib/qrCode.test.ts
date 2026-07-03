import { describe, it, expect } from 'vitest'
import { generateQrDataUrl } from './qrCode'

describe('generateQrDataUrl', () => {
  it('returns a base64 PNG data URL for the given URL', async () => {
    const dataUrl = await generateQrDataUrl('https://example.com/order?table=abc-123')
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})
