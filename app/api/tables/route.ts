import { NextResponse } from 'next/server'
import { createTable } from '@/lib/tableService'
import { handleApiError } from '@/lib/handleApiError'
import { requireApiRole } from '@/lib/authGuard'
import { ValidationError } from '@/lib/errors'

export async function POST(request: Request) {
  try {
    await requireApiRole('admin')

    const body = await request.json()

    if (typeof body.number !== 'number' || !Number.isInteger(body.number)) {
      throw new ValidationError('number is required and must be an integer')
    }

    const table = await createTable(body.number)
    return NextResponse.json(table, { status: 201 })
  } catch (error) {
    return handleApiError(error)
  }
}
