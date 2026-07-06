import Link from 'next/link'
import { listTables } from '@/lib/tableService'

export default async function TestTablePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="table-picker">
        <p role="alert" className="order-page__error">
          This page isn&apos;t available.
        </p>
      </main>
    )
  }

  const tables = await listTables()

  return (
    <main className="table-picker">
      <header className="order-header">
        <span className="order-header__eyebrow">QA · Table picker</span>
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
                <span className="table-picker__row-label">Table {table.number}</span>
                <span className="table-picker__chevron" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="table-picker__footnote">
        Dev only — customers reach tables by scanning the QR code.
      </p>
    </main>
  )
}
