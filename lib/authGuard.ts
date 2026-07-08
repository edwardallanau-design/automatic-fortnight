import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, SESSION_COOKIE_NAME } from './session'
import type { Role } from './types'
import { ForbiddenError } from './errors'

const ROLE_RANK: Record<Role, number> = {
  staff: 1,
  admin: 2,
}

export async function requireRole(minRole: Role): Promise<{ role: Role }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  const session = cookie ? verifySession(cookie.value) : null

  if (!session || ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    redirect('/login')
  }

  return session
}

export async function requireApiRole(minRole: Role): Promise<{ role: Role }> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)

  const session = cookie ? verifySession(cookie.value) : null

  if (!session || ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
    throw new ForbiddenError('Insufficient role for this action')
  }

  return session
}

export async function peekSession(): Promise<{ role: Role } | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(SESSION_COOKIE_NAME)
  return cookie ? verifySession(cookie.value) : null
}
