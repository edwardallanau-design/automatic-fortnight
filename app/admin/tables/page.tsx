import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { CreateTableForm } from './CreateTableForm'

export default async function AdminTablesPage() {
  await requireRole('admin')

  const tables = await listTables()
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const origin = `${protocol}://${host}`

  const tablesWithQr = await Promise.all(
    tables.map(async (table) => {
      const orderUrl = `${origin}/order?table=${table.id}`
      const qrDataUrl = await generateQrDataUrl(orderUrl)
      return { ...table, orderUrl, qrDataUrl }
    }),
  )

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Table Setup</h1>
      </header>
      <div className="admin-panel">
        <CreateTableForm />
      </div>
      {tablesWithQr.length === 0 ? (
        <p className="admin-empty">No tables yet — add one above.</p>
      ) : (
        <ul className="table-grid">
          {tablesWithQr.map((table) => (
            <li key={table.id} className="table-qr-card">
              <p className="table-qr-card__title">Table {table.number}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
              <img
                src={table.qrDataUrl}
                alt={`QR code for table ${table.number}`}
                width={160}
                height={160}
                className="table-qr-card__image"
              />
              <p className="table-qr-card__url">{table.orderUrl}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
