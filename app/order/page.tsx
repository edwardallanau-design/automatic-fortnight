import { getTableOrThrow } from '@/lib/tableService'
import { listMenuItems } from '@/lib/menuService'
import { NotFoundError } from '@/lib/errors'

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
          <ul className="menu-list">
            {items.map((item) => (
              <li key={item.id} className="menu-list__item">
                <button type="button" className="menu-item-button" disabled={!item.available}>
                  <span className="menu-item-button__name">{item.name}</span>
                  <span className="menu-item-button__price">${item.price.toString()}</span>
                </button>
              </li>
            ))}
          </ul>
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
