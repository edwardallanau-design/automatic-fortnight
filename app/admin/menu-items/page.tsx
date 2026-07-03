import { requireRole } from '@/lib/authGuard'
import { listMenuItems } from '@/lib/menuService'
import { CreateMenuItemForm } from './CreateMenuItemForm'
import { MenuItemRow } from './MenuItemRow'

export default async function AdminMenuItemsPage() {
  const session = await requireRole('staff')
  const isAdmin = session.role === 'admin'

  const items = await listMenuItems()

  return (
    <main>
      <h1>Menu Management</h1>
      {isAdmin && <CreateMenuItemForm />}
      <ul>
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
    </main>
  )
}
