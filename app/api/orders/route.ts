import { NextResponse } from 'next/server'
import { createOrder } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (typeof body.tableId !== 'string' || body.tableId.trim() === '') {
      throw new ValidationError('tableId is required')
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ValidationError('items must be a non-empty array')
    }
    for (const item of body.items) {
      if (typeof item.menuItemId !== 'string' || item.menuItemId.trim() === '') {
        throw new ValidationError('each item requires a menuItemId')
      }
      if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new ValidationError('each item requires a positive integer quantity')
      }
    }

    const order = await createOrder(body.tableId, body.items)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
