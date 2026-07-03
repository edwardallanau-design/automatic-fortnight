import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifySession, SESSION_COOKIE_NAME } from './session'
import type { Role } from './types'

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
