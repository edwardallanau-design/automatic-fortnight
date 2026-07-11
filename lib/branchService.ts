import bcrypt from 'bcrypt'
import type { Branch } from '@prisma/client'
import { prisma } from './prisma'
import { NotFoundError, ConflictError } from './errors'

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

export async function resolveBranchId(session: { branchId?: string }, requestedBranchId?: string): Promise<string> {
  if (session.branchId) {
    return session.branchId
  }
  if (requestedBranchId) {
    const branch = await getBranchOrThrow(requestedBranchId)
    return branch.id
  }
  const branch = await getMainBranch()
  return branch.id
}

export async function listBranches(): Promise<Branch[]> {
  return prisma.branch.findMany({ orderBy: { name: 'asc' } })
}

async function assertPasswordAvailable(password: string, excludeBranchId?: string): Promise<void> {
  const credentials = await prisma.credential.findMany(
    excludeBranchId
      ? { where: { OR: [{ branchId: { not: excludeBranchId } }, { branchId: null }] } }
      : undefined,
  )
  for (const credential of credentials) {
    if (await bcrypt.compare(password, credential.passwordHash)) {
      throw new ConflictError('This password is already in use by another branch or the admin login')
    }
  }
}

export async function createBranch(name: string, password: string): Promise<Branch> {
  await assertPasswordAvailable(password)

  const branch = await prisma.branch.create({ data: { name } })
  await prisma.orderingPoint.create({ data: { branchId: branch.id, label: 'Counter', isCounter: true } })
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.credential.create({ data: { role: 'staff', branchId: branch.id, passwordHash } })

  return branch
}

export async function renameBranch(id: string, name: string): Promise<Branch> {
  return prisma.branch.update({ where: { id }, data: { name } })
}

export async function setBranchAcceptingOrders(id: string, acceptingOrders: boolean): Promise<Branch> {
  return prisma.branch.update({ where: { id }, data: { acceptingOrders } })
}

export async function setBranchPassword(id: string, password: string): Promise<void> {
  await assertPasswordAvailable(password, id)

  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.credential.update({ where: { branchId: id }, data: { passwordHash } })
}
