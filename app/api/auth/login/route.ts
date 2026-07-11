import { NextResponse } from 'next/server'
import { login } from '@/lib/authService'
import { handleApiError } from '@/lib/handleApiError'
import { ValidationError } from '@/lib/errors'
import { signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (!body.password || typeof body.password !== 'string') {
      throw new ValidationError('password is required')
    }

    const { role, branchId } = await login(body.password)
    const token = signSession(role, branchId)

    const response = NextResponse.json({ role }, { status: 200 })
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: '/',
    })
    return response
  } catch (error) {
    return handleApiError(error)
  }
}
