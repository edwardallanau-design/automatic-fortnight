import { getTableOrThrow } from '@/lib/tableService'
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
    return (
      <main>
        <h1>Table {table.number}</h1>
        <p>Menu coming soon.</p>
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
