import jwt from 'jsonwebtoken'
import type { Role } from './types'

export const SESSION_COOKIE_NAME = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

function getSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set')
  }
  return secret
}

export function signSession(role: Role): string {
  return jwt.sign({ role }, getSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS })
}

export function verifySession(token: string): { role: Role } | null {
  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded === 'object' && decoded !== null && 'role' in decoded) {
      return { role: (decoded as { role: Role }).role }
    }
    return null
  } catch {
    return null
  }
}

export { SESSION_MAX_AGE_SECONDS }
