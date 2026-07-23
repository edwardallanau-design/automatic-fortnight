import { requireRole } from '@/lib/authGuard'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { listCategories } from '@/lib/categoryService'
import { resolveBranchId, getBranchOrThrow } from '@/lib/branchService'
import { MenuManager } from './MenuManager'

export default async function AdminMenuItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>
}) {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'
  const { branch: requestedBranchId } = await searchParams

  const branchId = await resolveBranchId(session, isAdmin ? requestedBranchId : undefined)
  const [branch, items, categories] = await Promise.all([
    getBranchOrThrow(branchId),
    listMenuItemsWithAvailability(branchId),
    listCategories(),
  ])

  const managedItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price.toString(),
    available: item.available,
    category: item.category
      ? { id: item.category.id, name: item.category.name, sortOrder: item.category.sortOrder }
      : null,
  }))
  const managedCategories = categories.map((c) => ({ id: c.id, name: c.name, sortOrder: c.sortOrder }))

  return (
    <main className="admin-page">
      <header className="admin-header">
        <span className="admin-header__eyebrow">{branch.name}</span>
        <h1 className="admin-header__title">Menu Management</h1>
      </header>
      {managedItems.length === 0 && managedCategories.length === 0 ? (
        <p className="admin-empty">No menu items yet — add a category or item to start.</p>
      ) : null}
      <MenuManager items={managedItems} categories={managedCategories} branchId={branchId} isAdmin={isAdmin} />
    </main>
  )
}
