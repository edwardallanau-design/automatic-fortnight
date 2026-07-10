import { NextResponse } from 'next/server'
import { setPaymentChoiceOnline } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()

    if (typeof body.paymentMethodId !== 'string' || body.paymentMethodId.trim() === '') {
      throw new ValidationError('paymentMethodId is required')
    }
    if (typeof body.reference !== 'string' || body.reference.trim() === '') {
      throw new ValidationError('reference is required')
    }

    const order = await setPaymentChoiceOnline(id, body.paymentMethodId, body.reference)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
