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
      <main>
        <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
      </main>
    )
  }

  try {
    const table = await getTableOrThrow(tableId)
    const items = await listMenuItems()

    return (
      <main>
        <h1>Table {table.number}</h1>
        {items.length === 0 ? (
          <p>No items available right now.</p>
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
        <main>
          <p role="alert">This table link isn&apos;t valid. Please ask staff for help.</p>
        </main>
      )
    }
    throw error
  }
}
