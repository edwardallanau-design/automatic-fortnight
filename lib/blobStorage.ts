import { put } from '@vercel/blob'
import { ValidationError } from './errors'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/

export async function uploadQrImage(paymentMethodId: string, dataUrl: string): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new ValidationError('qrImage must be a base64-encoded PNG, JPEG, or WebP data URL')
  }

  const [, extension, base64Data] = match
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ValidationError('qrImage must be smaller than 2MB')
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ValidationError('QR image upload is not configured in this environment')
  }

  const blob = await put(`payment-methods/${paymentMethodId}.${extension}`, buffer, {
    access: 'public',
    contentType: `image/${extension}`,
    addRandomSuffix: true,
  })
  return blob.url
}
