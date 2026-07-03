import Link from 'next/link'
import { requireRole } from '@/lib/authGuard'

export default async function DashboardPage() {
  const { role } = await requireRole('staff')

  return (
    <main>
      <h1>Staff Dashboard</h1>
      <p>Logged in as: {role}</p>
      {role === 'admin' && (
        <nav>
          <Link href="/admin/menu">Menu Management</Link>
          <Link href="/admin/tables">Table Setup</Link>
        </nav>
      )}
    </main>
  )
}
