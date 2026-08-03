import { NextResponse } from 'next/server'
import { unconfirmOrder } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(_request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('admin')

    const { id } = await context.params
    const order = await unconfirmOrder(id, session.role)
    return NextResponse.json(order, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
