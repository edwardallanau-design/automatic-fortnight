import { StaffBar } from './StaffBar'
import type { Role } from '@/lib/types'

export function StaffBarGate({ session }: { session: { role: Role } | null }) {
  if (!session) return null
  return <StaffBar role={session.role} />
}
