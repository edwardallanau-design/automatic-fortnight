// app/order/new/page.tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId } from '@/lib/branchService'

export default async function NewOrderPage() {
  const session = await requireRole('staff')

  const branchId = await resolveBranchId(session)
  const orderingPoints = await listOrderingPoints(branchId)

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">Staff · New order</span>
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
