import { StaffBar } from './StaffBar'
import { listBranches } from '@/lib/branchService'
import type { Role } from '@/lib/types'

export async function StaffBarGate({ session }: { session: { role: Role } | null }) {
  if (!session) return null

  const branches = session.role === 'admin' ? await listBranches() : []

  return <StaffBar role={session.role} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
}
