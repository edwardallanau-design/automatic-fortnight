import { NextResponse } from 'next/server'
import { createBranch } from '@/lib/branchService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new ValidationError('name is required')
    }
    if (typeof body.password !== 'string' || body.password.trim() === '') {
      throw new ValidationError('password is required')
    }

    const branch = await createBranch(body.name.trim(), body.password)
    return NextResponse.json(branch, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
