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
        <div className="staff-header__meta">
          <Link href="/order/new" className="staff-header__new-order">
            + New order
          </Link>
          <p className="staff-header__role">Logged in as: {role}</p>
          {role === 'admin' && (
            <nav className="staff-header__nav">
              <Link href="/admin/menu">Menu Management</Link>
              <Link href="/admin/tables">Table Setup</Link>
            </nav>
          )}
        </div>
      </header>
      <PendingOrdersDashboard />
    </main>
  )
}
