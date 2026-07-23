'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'
import { groupByCategory, type CategoryRef } from '@/lib/groupByCategory'
import type { Role } from '@/lib/types'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'
import type { PickerItem } from './MenuItemPicker'

const POLL_INTERVAL_MS = 3500
const EXIT_MS = 200

type DashboardOrder = OrderCardOrder
type Tab = 'pending' | 'confirmed'

type ModalState = { orderId: string; busy: boolean; error: string | null; closing: boolean }

type MenuApiItem = { id: string; name: string; price: string; available: boolean; category: CategoryRef | null }

// The item-mutation routes (POST/PATCH .../items[/:id]) return lib/orderService's OrderWithItems --
// items plus the base Order columns, but *not* orderingPoint/branch (no `include` for those). Typing
// the response as the full DashboardOrder was a lie the compiler couldn't catch: splicing it wholesale
// into state wiped orderingPoint/branch from the order and crashed OrderDetailModal on the next render
// (`order.orderingPoint.label`) -- caught live in a real browser, not by the jsdom-mocked unit tests,
// whose fixtures always happened to return a "complete" object. Only merge the field that changed.
type OrderItemsResponse = { items: DashboardOrder['items'] }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

function deriveCategories(items: MenuApiItem[]): CategoryRef[] {
  const seen = new Map<string, CategoryRef>()
  for (const item of items) {
    if (item.category && !seen.has(item.category.id)) seen.set(item.category.id, item.category)
  }
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function fetchTabs(): Promise<{ pending: DashboardOrder[]; confirmed: DashboardOrder[] }> {
  const [pending, confirmed] = await Promise.all([
    apiClient.get<DashboardOrder[]>('/api/orders?status=pending'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&date=today'),
  ])
  return { pending, confirmed }
}

export function PendingOrdersDashboard({
  role = 'staff',
  branches = [],
}: { role?: Role; branches?: { id: string; name: string }[] } = {}) {
  const searchParams = useSearchParams()
  const activeBranch = searchParams.get('branch') ?? 'all'
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<DashboardOrder[]>([])
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
  const [menuByBranch, setMenuByBranch] = useState<Record<string, MenuApiItem[]>>({})
  const [pendingAddCount, setPendingAddCount] = useState(0)
  const tempItemIdRef = useRef(0)
  const closeTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const tabs = await fetchTabs()
        if (cancelled) return
        setPendingOrders(tabs.pending)
        setConfirmedOrders(tabs.confirmed)
      } catch {
        // Transient poll failure: keep the last-known lists, retry next tick.
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const timerId of closeTimersRef.current) clearTimeout(timerId)
      closeTimersRef.current.clear()
    }
  }, [])

  const selectedOrder = modal
    ? [...pendingOrders, ...confirmedOrders].find((order) => order.id === modal.orderId) ?? null
    : null

  function openModal(orderId: string) {
    setModal({ orderId, busy: false, error: null, closing: false })

    // Cached for the life of this dashboard mount, not re-fetched on every reopen (design D4):
    // the server's sold-out check on add is authoritative, so this list only needs to be roughly
    // fresh, and re-fetching per open would reintroduce the per-tap network cost D4 argued against.
    const order = [...pendingOrders, ...confirmedOrders].find((o) => o.id === orderId)
    if (!order || order.branchId in menuByBranch) return
    apiClient
      .get<MenuApiItem[]>(`/api/menu-items?branchId=${order.branchId}`)
      .then((items) => {
        setMenuByBranch((current) => ({ ...current, [order.branchId]: items }))
      })
      .catch(() => {
        // Non-critical: the picker stays empty for this branch until the order is reopened.
      })
  }

  function buildPickerGroups(order: DashboardOrder): Array<{ id: string; name: string; items: PickerItem[] }> {
    const menuItems = menuByBranch[order.branchId] ?? []
    const countByMenuItemId = new Map<string, number>()
    for (const item of order.items) {
      countByMenuItemId.set(item.menuItemId, (countByMenuItemId.get(item.menuItemId) ?? 0) + item.quantity)
    }
    const withCategory = menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      available: item.available,
      countOnOrder: countByMenuItemId.get(item.id) ?? 0,
      category: item.category,
    }))
    return groupByCategory(withCategory, deriveCategories(menuItems))
  }

  function closeModal() {
    const closingOrderId = modal?.orderId
    setModal((current) => (current ? { ...current, closing: true } : current))
    const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
      closeTimersRef.current.delete(timerId)
      setModal((current) => (current && current.orderId === closingOrderId && current.closing ? null : current))
    }, EXIT_MS)
    closeTimersRef.current.add(timerId)
  }

  async function handleConfirm(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/confirm`, {})
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
        closeTimersRef.current.delete(timerId)
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal((current) => (current && current.orderId === order.id && current.closing ? null : current))
      }, EXIT_MS)
      closeTimersRef.current.add(timerId)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleCancel(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      await apiClient.del(`/api/orders/${order.id}`)
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
        closeTimersRef.current.delete(timerId)
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal((current) => (current && current.orderId === order.id && current.closing ? null : current))
      }, EXIT_MS)
      closeTimersRef.current.add(timerId)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleSetPaymentStatus(order: DashboardOrder, paymentStatus: 'Paid' | 'Unpaid') {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/pay`, { paymentStatus })
      const applyUpdate = (current: DashboardOrder[]) =>
        current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o))
      setPendingOrders(applyUpdate)
      setConfirmedOrders(applyUpdate)
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  function spliceOrder(updated: DashboardOrder) {
    const apply = (list: DashboardOrder[]) => list.map((o) => (o.id === updated.id ? updated : o))
    setPendingOrders(apply)
    setConfirmedOrders(apply)
  }

  // Adds are optimistic (design D6/INV-16 spec): the line and total update immediately, before the
  // POST resolves, so tap rate isn't bounded by network latency. On failure the line rolls back to
  // the pre-add snapshot captured in `order`. Confirm/Cancel/Mark Paid/Print are separately guarded by
  // settleBlockedByPendingAdd (pendingAddCount > 0) so staff can never settle against a total the server hasn't
  // yet agreed to -- see OrderTicketPane's settleBlockedByPendingAdd prop.
  async function handleAddItem(order: DashboardOrder, menuItemId: string) {
    const menuItem = (menuByBranch[order.branchId] ?? []).find((item) => item.id === menuItemId)
    if (!menuItem) return

    const existingLine = order.items.find((item) => item.menuItemId === menuItemId)
    const optimisticItems = existingLine
      ? order.items.map((item) => (item.id === existingLine.id ? { ...item, quantity: item.quantity + 1 } : item))
      : [
          ...order.items,
          {
            id: `temp-${tempItemIdRef.current++}`,
            menuItemId,
            nameSnapshot: menuItem.name,
            priceSnapshot: menuItem.price,
            quantity: 1,
          },
        ]
    spliceOrder({ ...order, items: optimisticItems })
    setModal((current) => (current ? { ...current, error: null } : current))
    setPendingAddCount((count) => count + 1)

    try {
      const updated = await apiClient.post<OrderItemsResponse>(`/api/orders/${order.id}/items`, { menuItemId, quantity: 1 })
      spliceOrder({ ...order, items: updated.items })
    } catch (err) {
      spliceOrder(order)
      setModal((current) => (current ? { ...current, error: errorMessage(err) } : current))
      // SOLD_OUT specifically, not the broader CONFLICT (ISSUE-28's second finding): addOrderItem's
      // 409s also cover INV-16 (order is Paid) and non-Pending orders, which are not the item being
      // unavailable -- conflating them greyed out a perfectly available item across the whole picker
      // session whenever any other 409 happened to fire on this same order.
      if (err instanceof ApiError && err.code === 'SOLD_OUT') {
        setMenuByBranch((current) => ({
          ...current,
          [order.branchId]: (current[order.branchId] ?? []).map((item) =>
            item.id === menuItemId ? { ...item, available: false } : item,
          ),
        }))
      }
    } finally {
      setPendingAddCount((count) => count - 1)
    }
  }

  async function handleAdjustQuantity(order: DashboardOrder, itemId: string, quantity: number) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<OrderItemsResponse>(`/api/orders/${order.id}/items/${itemId}`, { quantity })
      spliceOrder({ ...order, items: updated.items })
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleRemoveItem(order: DashboardOrder, itemId: string) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      // DELETE returns 204 with no body, so the post-removal order is built locally rather than spliced.
      await apiClient.del(`/api/orders/${order.id}/items/${itemId}`)
      spliceOrder({ ...order, items: order.items.filter((item) => item.id !== itemId) })
      setModal((current) => (current ? { ...current, busy: false, error: null } : current))
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  function sortConfirmedOrders(orders: DashboardOrder[]): DashboardOrder[] {
    const sorted = [...orders].sort((a, b) => {
      const aTime = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0
      const bTime = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0
      return aTime - bTime
    })
    return sortDirection === 'newest' ? sorted.reverse() : sorted
  }

  function branchFiltered(list: DashboardOrder[]): DashboardOrder[] {
    return activeBranch === 'all' ? list : list.filter((o) => o.branchId === activeBranch)
  }

  const activeOrders = branchFiltered(activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders))
  const showBranchTag = branches.length > 0 && activeBranch === 'all'
  const emptyMessage = activeTab === 'pending' ? 'No pending orders' : 'No orders confirmed yet today'

  return (
    <div className="order-rail">
      <div className="order-rail__status">
        <span className="order-rail__pulse" aria-hidden="true" />
        <span>Live — refreshes every few seconds</span>
      </div>

      <div className="order-rail__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pending'}
          className={`order-rail__tab${activeTab === 'pending' ? ' order-rail__tab--active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending ({branchFiltered(pendingOrders).length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'confirmed'}
          className={`order-rail__tab${activeTab === 'confirmed' ? ' order-rail__tab--active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          Confirmed ({branchFiltered(confirmedOrders).length})
        </button>
      </div>

      {activeTab === 'confirmed' && (
        <button
          type="button"
          className="order-rail__sort"
          onClick={() => setSortDirection((current) => (current === 'newest' ? 'oldest' : 'newest'))}
        >
          <span className="order-rail__sort-arrow" aria-hidden="true">
            {sortDirection === 'newest' ? '↓' : '↑'}
          </span>
          {sortDirection === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>
      )}

      <section
        className="order-rail__panel"
        aria-label={activeTab === 'pending' ? 'Pending orders' : 'Confirmed orders'}
      >
        {activeOrders.length === 0 ? (
          <p className="order-rail__empty-eyebrow">{emptyMessage}</p>
        ) : (
          <ul className="order-grid">
            {activeOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                exiting={exitingIds.has(order.id)}
                showBranch={showBranchTag}
                onOpen={() => openModal(order.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
          busy={modal.busy}
          settleBlockedByPendingAdd={pendingAddCount > 0}
          error={modal.error}
          exiting={modal.closing}
          pickerGroups={buildPickerGroups(selectedOrder)}
          onConfirm={() => handleConfirm(selectedOrder)}
          onSetPaymentStatus={(paymentStatus) => handleSetPaymentStatus(selectedOrder, paymentStatus)}
          onCancelOrder={() => handleCancel(selectedOrder)}
          onAddItem={(menuItemId) => handleAddItem(selectedOrder, menuItemId)}
          onAdjustQuantity={(itemId, quantity) => handleAdjustQuantity(selectedOrder, itemId, quantity)}
          onRemoveItem={(itemId) => handleRemoveItem(selectedOrder, itemId)}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
