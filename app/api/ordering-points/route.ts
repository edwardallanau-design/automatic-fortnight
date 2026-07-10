import { NextResponse } from 'next/server'
import { createOrderingPoint } from '@/lib/orderingPointService'
import { resolveBranchId } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    const session = await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.label !== 'string' || body.label.trim() === '') {
      throw new ValidationError('label is required')
    }

    const branchId = await resolveBranchId(session, body.branchId)
    const orderingPoint = await createOrderingPoint(branchId, body.label.trim())
    return NextResponse.json(orderingPoint, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
