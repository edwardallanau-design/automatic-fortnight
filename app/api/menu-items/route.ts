import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { createMenuItem, listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function GET() {
  try {
    const session = await requireApiRole('staff')
    const branchId = await resolveBranchId(session)
    const items = await listMenuItemsWithAvailability(branchId)
    return NextResponse.json(items, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (typeof body.price !== 'number' || !(body.price > 0)) {
      throw new ValidationError('price is required and must be a positive number')
    }

    const item = await createMenuItem(body.name.trim(), new Prisma.Decimal(body.price))
    return NextResponse.json(item, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
