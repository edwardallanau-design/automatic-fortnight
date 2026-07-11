import { headers } from 'next/headers'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'
import { generateQrDataUrl } from '@/lib/qrCode'
import { CreateOrderingPointForm } from './CreateOrderingPointForm'

export default async function AdminTablesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, requestedBranchId)
  const [branch, orderingPoints] = await Promise.all([
    getBranchOrThrow(branchId),
    listOrderingPoints(branchId),
  ])
  const headerList = await headers()
  const host = headerList.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const origin = `${protocol}://${host}`

  const pointsWithQr = await Promise.all(
    orderingPoints.map(async (point) => {
      const orderUrl = `${origin}/order?table=${point.id}`
      const qrDataUrl = await generateQrDataUrl(orderUrl)
      return { ...point, orderUrl, qrDataUrl }
    }),
  )

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">{branch.name}</span>
        <h1 className="admin-header__title">Table Setup</h1>
      </header>
      <div className="admin-panel">
        <CreateOrderingPointForm branchId={branchId} />
      </div>
      {pointsWithQr.length === 0 ? (
        <p className="admin-empty">No tables yet — add one above.</p>
      ) : (
        <ul className="table-grid">
          {pointsWithQr.map((point) => (
            <li key={point.id} className="table-qr-card">
              <p className="table-qr-card__title">{point.label}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL, not an optimizable remote image */}
              <img
                src={point.qrDataUrl}
                alt={`QR code for ${point.label}`}
                width={160}
                height={160}
                className="table-qr-card__image"
              />
              <p className="table-qr-card__url">{point.orderUrl}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
