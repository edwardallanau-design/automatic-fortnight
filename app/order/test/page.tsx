import Link from 'next/link'
import { listTables } from '@/lib/tableService'

// Render per-request rather than statically prerendering at build time, so the
// ENABLE_TEST_PICKER / NODE_ENV gate is evaluated against the *runtime*
// environment (e.g. the flag set in .env.docker), not the build-time one.
export const dynamic = 'force-dynamic'

// The test picker is hidden by default. It renders only in development, or
// when ENABLE_TEST_PICKER=true is explicitly set (e.g. in .env.docker) — so a
// real production deploy that doesn't set the flag stays hidden.
function testPickerEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_TEST_PICKER === 'true'
  )
}

export default async function TestTablePage() {
  if (!testPickerEnabled()) {
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
