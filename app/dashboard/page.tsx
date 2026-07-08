import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'
import { PendingOrdersDashboard } from './PendingOrdersDashboard'

export default async function DashboardPage() {
  const { role } = await requireRole('staff')

  return (
    <main className="staff-dashboard">
      <header className="staff-header">
        <div>
          <span className="staff-header__eyebrow">Order rail</span>
          <h1 className="staff-header__title">Staff Dashboard</h1>
        </div>
        <Link href="/order/new" className="staff-header__new-order">
          + New order
        </Link>
      </header>
      <PendingOrdersDashboard role={role} />
    </main>
  )
}
