// app/order/new/page.tsx
import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { formatTableLabel } from '@/lib/tableDisplay'

export default async function NewOrderPage() {
  await requireRole('staff')

  const tables = await listTables()

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">Staff · New order</span>
        <h1 className="order-header__title">Choose a table</h1>
      </header>

      {tables.length === 0 ? (
        <p className="table-picker__empty">
          No tables yet. Create one in <Link href="/admin/tables">Table setup</Link>.
        </p>
      ) : (
        <ul className="table-picker__list">
          {tables.map((table) => (
            <li key={table.id}>
              <Link className="table-picker__row" href={`/order?table=${table.id}`}>
                <span className="table-picker__row-label">{formatTableLabel(table.number)}</span>
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
