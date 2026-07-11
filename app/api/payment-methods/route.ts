import { NextResponse } from 'next/server'
import { createPaymentMethod } from '@/lib/paymentMethodService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (body.accountInfo !== undefined && typeof body.accountInfo !== 'string') {
      throw new ValidationError('accountInfo must be a string')
    }

    const method = await createPaymentMethod(body.name.trim(), {
      accountInfo: body.accountInfo?.trim(),
    })
    return NextResponse.json(method, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
