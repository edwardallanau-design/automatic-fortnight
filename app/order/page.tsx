import { getOrderingPointOrThrow } from '@/lib/orderingPointService'
import { getBranchOrThrow } from '@/lib/branchService'
import { listMenuItemsWithAvailability } from '@/lib/menuService'
import { getVenueSettings } from '@/lib/venueSettingsService'
import { NotFoundError } from '@/lib/errors'
import { Cart } from './Cart'
import { OrderHeaderTitle } from './OrderHeaderTitle'

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>
}) {
  const { table: orderingPointId } = await searchParams

  if (!orderingPointId) {
    return (
      <main className="order-page">
        <p role="alert" className="order-page__error">
          This table link isn&apos;t valid. Please ask staff for help.
        </p>
      </main>
    )
  }

  let orderingPoint: Awaited<ReturnType<typeof getOrderingPointOrThrow>>
  try {
    orderingPoint = await getOrderingPointOrThrow(orderingPointId)
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

  const [settings, branch] = await Promise.all([
    getVenueSettings(),
    getBranchOrThrow(orderingPoint.branchId),
  ])

  if (!settings.acceptingOrders || !branch.acceptingOrders) {
    return (
      <main className="order-page">
        <p role="alert" className="order-page__error">
          We&apos;re not accepting orders right now. Please check back later.
        </p>
      </main>
    )
  }

  const items = await listMenuItemsWithAvailability(branch.id)

  return (
    <main className="order-page">
      <header className="order-header">
        <div className="order-header__row">
          <span className="order-header__eyebrow">Now serving</span>
        </div>
        <OrderHeaderTitle tableId={orderingPoint.id} label={orderingPoint.label} />
      </header>
      {items.length === 0 ? (
        <p className="order-page__empty">No items available right now.</p>
      ) : (
        <Cart
          tableId={orderingPoint.id}
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
}
