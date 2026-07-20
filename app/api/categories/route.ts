import { NextResponse } from 'next/server'
import { createCategory } from '@/lib/categoryService'
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

    const category = await createCategory(body.name.trim())
    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
