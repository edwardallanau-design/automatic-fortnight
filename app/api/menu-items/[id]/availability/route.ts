import { NextResponse } from 'next/server'
import { updateMenuItem } from '@/lib/menuService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('staff')

    const { id } = await context.params
    const body = await request.json()

    if (typeof body.available !== 'boolean') {
      throw new ValidationError('available must be a boolean')
    }

    const item = await updateMenuItem(id, { available: body.available })
    return NextResponse.json(item, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
