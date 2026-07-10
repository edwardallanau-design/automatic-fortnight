import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId } from '@/lib/branchService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage() {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'

  const branchId = await resolveBranchId(session)
  const items = await listMenuItemsWithAvailability(branchId)

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">Admin</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {isAdmin && (
        <div className="admin-panel">
          <CreateMenuItemForm />
        </div>
      )}
      {items.length === 0 ? (
        <p className="admin-empty">No menu items yet — add one above.</p>
      ) : (
        <ul className="menu-admin-list">
          {items.map((item) => (
            <MenuItemRow
              key={item.id}
              id={item.id}
              name={item.name}
              price={item.price.toString()}
              available={item.available}
              editable={isAdmin}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
