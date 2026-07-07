import { NextResponse } from 'next/server'
import type { FulfillmentStatus } from '@prisma/client'
import { createOrder, listOrders } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'

const STATUS_PARAM_MAP: Record<string, FulfillmentStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

export async function GET(request: Request) {
  try {
    await requireApiRole('staff')

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')

    let status: FulfillmentStatus | undefined
    if (statusParam !== null) {
      status = STATUS_PARAM_MAP[statusParam]
      if (!status) {
        throw new ValidationError(`Invalid status: ${statusParam}`)
      }
    }

    const orders = await listOrders({ status })
    return NextResponse.json(orders, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

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

    let customerName: string | undefined
    if (body.customerName !== undefined && body.customerName !== null) {
      if (typeof body.customerName !== 'string') {
        throw new ValidationError('customerName must be a string')
      }
      customerName = body.customerName.trim()
      if (customerName.length > 50) {
        throw new ValidationError('customerName must be 50 characters or fewer')
      }
    }

    const order = await createOrder(body.tableId, body.items, customerName)
    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
