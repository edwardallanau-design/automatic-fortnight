import { NextResponse } from 'next/server'
import { renameCategory, deleteCategory } from '@/lib/categoryService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    const body = await request.json()

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      throw new ValidationError('name is required')
    }

    const category = await renameCategory(id, body.name.trim())
    return NextResponse.json(category, { status: 200 })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    await requireApiRole('admin')

    const { id } = await context.params
    await deleteCategory(id)
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return handleApiError(error)
  }
}
