// app/order/new/page.tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { getBranchOrThrow, listBranches } from '@/lib/branchService'
import { NotFoundError } from '@/lib/errors'
import type { Branch } from '@prisma/client'

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const { branch: requestedBranchId } = await searchParams

  // An order belongs to exactly one branch (INV-13), so the staff-assisted
  // flow must resolve one before showing tables. Staff are pinned to their own
  // branch; an admin follows the header's ?branch= selection. When the admin
  // hasn't picked a specific branch ("All branches", nothing, or a stale id),
  // there's no single target — show a branch chooser rather than silently
  // defaulting to one branch (the ISSUE-24 bug).
  let branch: Branch | null = null
  if (session.branchId) {
    branch = await getBranchOrThrow(session.branchId)
  } else if (requestedBranchId && requestedBranchId !== 'all') {
    try {
      branch = await getBranchOrThrow(requestedBranchId)
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error
      // Unknown branch id — fall through to the chooser.
    }
  }

  if (!branch) {
    const branches = await listBranches()
    return (
      <main className="table-picker">
        <header className="order-header">
          <span className="order-header__eyebrow">Staff · New order</span>
          <h1 className="order-header__title">Choose a branch</h1>
        </header>

        {branches.length === 0 ? (
          <p className="table-picker__empty">No branches yet.</p>
        ) : (
          <ul className="table-picker__list">
            {branches.map((b) => (
              <li key={b.id}>
                <Link className="table-picker__row" href={`/order/new?branch=${b.id}`}>
                  <span className="table-picker__row-label">{b.name}</span>
                  <span className="table-picker__chevron" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    )
  }

  const orderingPoints = await listOrderingPoints(branch.id)

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">Staff · New order · {branch.name}</span>
        <h1 className="order-header__title">Choose a table</h1>
      </header>

      {orderingPoints.length === 0 ? (
        <p className="table-picker__empty">
          No tables yet. Create one in <Link href="/admin/tables">Table setup</Link>.
        </p>
      ) : (
        <ul className="table-picker__list">
          {orderingPoints.map((point) => (
            <li key={point.id}>
              <Link className="table-picker__row" href={`/order?table=${point.id}`}>
                <span className="table-picker__row-label">{point.label}</span>
                <span className="table-picker__chevron" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
