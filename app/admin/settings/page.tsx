import { requireRole } from '@/lib/authGuard'
import { getVenueSettings } from '@/lib/venueSettingsService'
import { AcceptingOrdersToggle } from './AcceptingOrdersToggle'

export default async function AdminSettingsPage() {
  await requireRole('admin')

  const settings = await getVenueSettings()

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Settings</h1>
      </header>
      <div className="admin-panel">
        <AcceptingOrdersToggle acceptingOrders={settings.acceptingOrders} />
      </div>
    </main>
  )
}
