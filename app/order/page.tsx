import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { NotFoundError } from '@/lib/errors'
import { Cart } from './Cart'

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const { table: tableId } = await searchParams

  if (!tableId) {
    return (
      <main className="order-page">
        <p role="alert" className="order-page__error">
          This table link isn&apos;t valid. Please ask staff for help.
        </p>
      </main>
    )
  }

  try {
    const table = await getTableOrThrow(tableId)
    const items = await listMenuItems()

    return (
      <main className="order-page">
        <header className="order-header">
          <span className="order-header__eyebrow">Now serving</span>
          <h1 className="order-header__title">Table {table.number}</h1>
        </header>
        {items.length === 0 ? (
          <p className="order-page__empty">No items available right now.</p>
        ) : (
          <Cart
            tableId={table.id}
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price.toString(),
              available: item.available,
            }))}
          />
        )}
      </main>
    )
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="order-page">
          <p role="alert" className="order-page__error">
            This table link isn&apos;t valid. Please ask staff for help.
          </p>
        </main>
      )
    }
    throw error
  }
}
