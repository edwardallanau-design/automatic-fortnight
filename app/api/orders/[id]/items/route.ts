import { NextResponse } from 'next/server'
import { addOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { peekSession } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const body = await request.json()

    if (typeof body.menuItemId !== 'string' || body.menuItemId.trim() === '') {
      throw new ValidationError('menuItemId is required')
    }
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity < 1) {
      throw new ValidationError('quantity must be a positive integer')
    }

    const session = await peekSession()
    const order = await addOrderItem(id, body.menuItemId, body.quantity, session?.role)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
