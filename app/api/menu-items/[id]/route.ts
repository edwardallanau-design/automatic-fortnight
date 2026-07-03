import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { updateMenuItem, archiveMenuItem } from '@/lib/menuService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    const body = await request.json()

    const data: { name?: string; price?: Prisma.Decimal; available?: boolean } = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new ValidationError('name must be a non-empty string')
      }
      data.name = body.name
    }
    if (body.price !== undefined) {
      if (typeof body.price !== 'number' || !(body.price > 0)) {
        throw new ValidationError('price must be a positive number')
      }
      data.price = new Prisma.Decimal(body.price)
    }
    if (body.available !== undefined) {
      if (typeof body.available !== 'boolean') {
        throw new ValidationError('available must be a boolean')
      }
      data.available = body.available
    }

    const item = await updateMenuItem(id, data)
    return NextResponse.json(item, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    await archiveMenuItem(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
