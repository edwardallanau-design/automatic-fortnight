'use client'

import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'

const POLL_INTERVAL_MS = 3500
const EXIT_MS = 200

type DashboardOrder = OrderCardOrder
type Tab = 'pending' | 'confirmed'

type ModalState = { orderId: string; busy: boolean; error: string | null; closing: boolean }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

async function fetchTabs(): Promise<{ pending: DashboardOrder[]; confirmed: DashboardOrder[] }> {
  const [pending, confirmed] = await Promise.all([
    apiClient.get<DashboardOrder[]>('/api/orders?status=pending'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&date=today'),
  ])
  return { pending, confirmed }
}

export function PendingOrdersDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('pending')
  const [sortDirection, setSortDirection] = useState<'newest' | 'oldest'>('newest')
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedOrders, setConfirmedOrders] = useState<DashboardOrder[]>([])
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
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

  function sortConfirmedOrders(orders: DashboardOrder[]): DashboardOrder[] {
    const sorted = [...orders].sort((a, b) => {
      const aTime = a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0
      const bTime = b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0
      return aTime - bTime
    })
    return sortDirection === 'newest' ? sorted.reverse() : sorted
  }

  const activeOrders = activeTab === 'pending' ? pendingOrders : sortConfirmedOrders(confirmedOrders)
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
          Pending ({pendingOrders.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'confirmed'}
          className={`order-rail__tab${activeTab === 'confirmed' ? ' order-rail__tab--active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          Confirmed ({confirmedOrders.length})
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
                onOpen={() => openModal(order.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          busy={modal.busy}
          error={modal.error}
          exiting={modal.closing}
          onConfirm={() => handleConfirm(selectedOrder)}
          onSetPaymentStatus={(paymentStatus) => handleSetPaymentStatus(selectedOrder, paymentStatus)}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
