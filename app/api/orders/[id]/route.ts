import { NextResponse } from 'next/server'
import { cancelOrder } from '@/lib/orderService'
import { handleApiError } from '@/lib/handleApiError'
import { peekSession } from '@/lib/authGuard'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const session = await peekSession()
    await cancelOrder(id, session?.role ?? 'customer')
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
