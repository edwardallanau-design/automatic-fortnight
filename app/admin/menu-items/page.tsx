import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, isAdmin ? requestedBranchId : undefined)
  const [branch, items] = await Promise.all([
    getBranchOrThrow(branchId),
    listMenuItemsWithAvailability(branchId),
  ])

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">{branch.name}</span>
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
              branchId={branchId}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
