import { NextResponse } from 'next/server'
import { removeOrderItem, updateOrderItemQuantity } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')
    const { id, itemId } = await context.params
    await removeOrderItem(id, itemId, session.role)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')
    const { id, itemId } = await context.params
    const body = await request.json()

    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const order = await updateOrderItemQuantity(id, itemId, body.quantity, session.role)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
