import { NextResponse } from 'next/server'
import { getOrderEvents } from '@/lib/orderService'
import { requireApiRole } from '@/lib/authGuard'
import { handleApiError } from '@/lib/handleApiError'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireApiRole('staff')

    const { id } = await context.params
    const events = await getOrderEvents(id)
    return NextResponse.json(events, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
