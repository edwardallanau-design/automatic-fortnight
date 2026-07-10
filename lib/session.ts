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

export function signSession(role: Role, branchId?: string): string {
  return jwt.sign({ role, branchId }, getSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS })
}

function isRole(value: unknown): value is Role {
  return value === 'staff' || value === 'admin'
}

export function verifySession(token: string): { role: Role; branchId?: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret())
    if (typeof decoded === 'object' && decoded !== null && isRole((decoded as { role?: unknown }).role)) {
      const branchId = (decoded as { branchId?: unknown }).branchId
      return {
        role: (decoded as { role: Role }).role,
        ...(typeof branchId === 'string' ? { branchId } : {}),
      }
    }
    return null
  } catch {
    return null
  }
}

export { SESSION_MAX_AGE_SECONDS }
