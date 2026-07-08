import { NextResponse } from 'next/server'
import { getOrderById } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const order = await getOrderById(id)
    return NextResponse.json({ fulfillmentStatus: order.fulfillmentStatus }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
