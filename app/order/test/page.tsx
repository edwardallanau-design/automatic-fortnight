import Link from 'next/link'
import { listTables } from '@/lib/tableService'

export default async function TestTablePage() {
  if (process.env.NODE_ENV === 'production') {
    return (
      <main className="order-page">
        <p className="order-page__error">This page isn&apos;t available.</p>
      </main>
    )
  }

  const tables = await listTables()

  return (
    <main className="order-page">
      <h1>Test table picker</h1>
      {tables.length === 0 ? (
        <p>No tables have been created yet.</p>
      ) : (
        <ul>
          {tables.map((table) => (
            <li key={table.id}>
              <Link href={`/order?table=${table.id}`}>Table {table.number}</Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
