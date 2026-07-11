import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listBranches, getBranchOrThrow } from '@/lib/branchService'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const role = session.role
  const branches = role === 'admin' ? await listBranches() : []
  const { branch: requestedBranchId } = await searchParams

  // The eyebrow names the branch this view is scoped to. Admin follows the
  // header picker's ?branch= selection (a specific branch, or the whole venue);
  // staff are fixed to their own branch.
  let branchLabel: string
  if (role === 'admin') {
    if (requestedBranchId && requestedBranchId !== 'all') {
      branchLabel = branches.find((b) => b.id === requestedBranchId)?.name ?? 'All branches'
    } else {
      branchLabel = branches.length === 1 ? branches[0].name : 'All branches'
    }
  } else if (session.branchId) {
    branchLabel = (await getBranchOrThrow(session.branchId)).name
  } else {
    branchLabel = 'Orders'
  }

  // Carry the admin's header branch selection into the staff-assisted order
  // flow so the order lands in the branch they're actually viewing (ISSUE-24).
  // A specific id lists that branch's tables; 'all' (or nothing) lands on the
  // branch chooser. Staff are pinned to their session branch, so no qualifier.
  const newOrderHref =
    role === 'admin' && requestedBranchId ? `/order/new?branch=${requestedBranchId}` : '/order/new'

  return (
    <main className="staff-dashboard">
      <header className="staff-header">
        <div>
          <span className="staff-header__eyebrow">{branchLabel}</span>
          <h1 className="staff-header__title">Order Dashboard</h1>
        </div>
        <Link href={newOrderHref} className="staff-header__new-order">
          + New order
        </Link>
      </header>
      <PendingOrdersDashboard role={role} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
    </main>
  )
}
