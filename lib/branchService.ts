import type { Branch } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError } from './errors'

export async function getBranchOrThrow(id: string): Promise<Branch> {
  const branch = await prisma.branch.findUnique({ where: { id } })
  if (!branch) {
    throw new NotFoundError('Branch not found')
  }
  return branch
}

export async function getMainBranch(): Promise<Branch> {
  const branch = await prisma.branch.findFirst({ where: { name: 'Main' } })
  if (!branch) {
    throw new NotFoundError('Main branch not found')
  }
  return branch
}

export async function resolveBranchId(session: { branchId?: string }): Promise<string> {
  if (session.branchId) {
    return session.branchId
  }
  const branch = await getMainBranch()
  return branch.id
}
