import { NextResponse } from 'next/server'
import { renameBranch, setBranchAcceptingOrders, setBranchPassword } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    const body = await request.json()

    if (body.name === undefined && body.acceptingOrders === undefined && body.password === undefined) {
      throw new ValidationError('At least one of name, acceptingOrders, or password is required')
    }

    let branch
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim() === '') {
        throw new ValidationError('name must be a non-empty string')
      }
      branch = await renameBranch(id, body.name.trim())
    }
    if (body.acceptingOrders !== undefined) {
      if (typeof body.acceptingOrders !== 'boolean') {
        throw new ValidationError('acceptingOrders must be a boolean')
      }
      branch = await setBranchAcceptingOrders(id, body.acceptingOrders)
    }
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.trim() === '') {
        throw new ValidationError('password must be a non-empty string')
      }
      await setBranchPassword(id, body.password)
    }

    return NextResponse.json(branch ?? { id }, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
