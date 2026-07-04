import { NextResponse } from 'next/server'
import type { PaymentStatus } from '@prisma/client'
import { setPaymentStatus } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['Unpaid', 'Paid']

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { role } = await requireApiRole('staff')

    const { id } = await context.params
    const body = await request.json()

    if (!VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
      throw new ValidationError('paymentStatus must be "Unpaid" or "Paid"')
    }

    const order = await setPaymentStatus(id, body.paymentStatus, role)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
