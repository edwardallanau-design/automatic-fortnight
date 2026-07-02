import bcrypt from 'bcrypt'
import { prisma } from './prisma'
import { InvalidCredentialError } from './errors'
import type { Role } from './types'

export async function login(password: string): Promise<{ role: Role }> {
  const credentials = await prisma.credential.findMany()

  for (const credential of credentials) {
    const matches = await bcrypt.compare(password, credential.passwordHash)
    if (matches) {
      return { role: credential.role as Role }
    }
  }

  throw new InvalidCredentialError('Password does not match any known role')
}
