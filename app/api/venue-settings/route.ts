import { NextResponse } from 'next/server'
import { setAcceptingOrders } from '@/lib/venueSettingsService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

export async function PATCH(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.acceptingOrders !== 'boolean') {
      throw new ValidationError('acceptingOrders must be a boolean')
    }

    const settings = await setAcceptingOrders(body.acceptingOrders)
    return NextResponse.json(settings, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
