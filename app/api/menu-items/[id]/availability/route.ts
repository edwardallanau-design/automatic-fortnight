import { NextResponse } from 'next/server'
import { findMenuItemsByIds, setMenuItemSoldOut } from '@/lib/menuService'
import { resolveBranchId } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { NotFoundError, ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireApiRole('staff')

    const { id } = await context.params
    const body = await request.json()

    if (typeof body.available !== 'boolean') {
      throw new ValidationError('available must be a boolean')
    }

    const [item] = await findMenuItemsByIds([id])
    if (!item) {
      throw new NotFoundError('Menu item not found')
    }

    const branchId = await resolveBranchId(session)
    await setMenuItemSoldOut(id, branchId, !body.available)

    return NextResponse.json({ ...item, available: body.available }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
