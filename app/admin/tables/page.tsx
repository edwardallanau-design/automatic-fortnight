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
    <main>
      <h1>Table Setup</h1>
      <CreateTableForm />
      <ul>
        {tablesWithQr.map((table) => (
          <li key={table.id}>
            <p>Table {table.number}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
            <img src={table.qrDataUrl} alt={`QR code for table ${table.number}`} width={200} height={200} />
            <p>{table.orderUrl}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
