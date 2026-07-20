import { NextResponse } from 'next/server'
import { reorderCategories } from '@/lib/categoryService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function PATCH(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (!Array.isArray(body.orderedIds) || body.orderedIds.some((id: unknown) => typeof id !== 'string')) {
      throw new ValidationError('orderedIds must be an array of strings')
    }

    await reorderCategories(body.orderedIds)
    return NextResponse.json({}, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}
