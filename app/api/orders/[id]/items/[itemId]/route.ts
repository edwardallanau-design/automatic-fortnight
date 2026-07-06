import { NextResponse } from 'next/server'
import { removeOrderItem } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id, itemId } = await context.params
    await removeOrderItem(id, itemId)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
