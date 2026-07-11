import { NextResponse } from 'next/server'
import { updatePaymentMethod } from '@/lib/paymentMethodService'
import { uploadQrImage } from '@/lib/blobStorage'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    const body = await request.json()

    const data: { name?: string; accountInfo?: string; qrImageUrl?: string; active?: boolean } = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new ValidationError('name must be a non-empty string')
      }
      data.name = body.name.trim()
    }
    if (body.accountInfo !== undefined) {
      if (typeof body.accountInfo !== 'string') {
        throw new ValidationError('accountInfo must be a string')
      }
      data.accountInfo = body.accountInfo.trim()
    }
    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') {
        throw new ValidationError('active must be a boolean')
      }
      data.active = body.active
    }
    if (body.qrImage !== undefined) {
      if (typeof body.qrImage !== 'string') {
        throw new ValidationError('qrImage must be a base64 data URL string')
      }
      data.qrImageUrl = await uploadQrImage(id, body.qrImage)
    }

    const method = await updatePaymentMethod(id, data)
    return NextResponse.json(method, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
