'use client'

import { useEffect, useRef, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import type { Role } from '@/lib/types'
import { OrderCard, type OrderCardOrder } from './OrderCard'
import { OrderDetailModal } from './OrderDetailModal'

const POLL_INTERVAL_MS = 3500
const LANE_EXIT_MS = 200
const SUMMARY_BUMP_MS = 300

type DashboardOrder = OrderCardOrder

type ModalState = { orderId: string; busy: boolean; error: string | null; closing: boolean }

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

async function fetchLanes(): Promise<{
  pending: DashboardOrder[]
  confirmedUnpaid: DashboardOrder[]
  completedTodayCount: number
}> {
  const [pending, confirmedUnpaid, completedToday] = await Promise.all([
    apiClient.get<DashboardOrder[]>('/api/orders?status=pending'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&paymentStatus=unpaid'),
    apiClient.get<DashboardOrder[]>('/api/orders?status=confirmed&paymentStatus=paid&date=today'),
  ])
  return { pending, confirmedUnpaid, completedTodayCount: completedToday.length }
}

export function PendingOrdersDashboard({ role }: { role: Role }) {
  const [pendingOrders, setPendingOrders] = useState<DashboardOrder[]>([])
  const [confirmedUnpaidOrders, setConfirmedUnpaidOrders] = useState<DashboardOrder[]>([])
  const [completedTodayCount, setCompletedTodayCount] = useState(0)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState | null>(null)
  const [summaryBump, setSummaryBump] = useState(false)
  const bumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const lanes = await fetchLanes()
        if (cancelled) return
        setPendingOrders(lanes.pending)
        setConfirmedUnpaidOrders(lanes.confirmedUnpaid)
        setCompletedTodayCount(lanes.completedTodayCount)
      } catch {
        // Transient poll failure: keep the last-known lanes, retry next tick.
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
      if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current)
    }
  }, [])

  function bumpSummary() {
    setSummaryBump(true)
    if (bumpTimerRef.current) clearTimeout(bumpTimerRef.current)
    bumpTimerRef.current = setTimeout(() => setSummaryBump(false), SUMMARY_BUMP_MS)
  }

  const selectedOrder = modal
    ? [...pendingOrders, ...confirmedUnpaidOrders].find((order) => order.id === modal.orderId) ?? null
    : null

  function openModal(orderId: string) {
    setModal({ orderId, busy: false, error: null, closing: false })
  }

  function closeModal() {
    setModal((current) => (current ? { ...current, closing: true } : current))
    setTimeout(() => setModal(null), LANE_EXIT_MS)
  }

  async function handleConfirm(order: DashboardOrder) {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/confirm`, {})
      setExitingIds((current) => new Set(current).add(order.id))
      setModal((current) => (current ? { ...current, closing: true } : current))
      setTimeout(() => {
        setPendingOrders((current) => current.filter((o) => o.id !== order.id))
        if (updated.paymentStatus === 'Paid') {
          setCompletedTodayCount((count) => count + 1)
          bumpSummary()
        } else {
          setConfirmedUnpaidOrders((current) => [
            ...current,
            { ...order, fulfillmentStatus: 'Confirmed', paymentStatus: updated.paymentStatus },
          ])
        }
        setExitingIds((current) => {
          const next = new Set(current)
          next.delete(order.id)
          return next
        })
        setModal(null)
      }, LANE_EXIT_MS)
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  async function handleSetPaymentStatus(order: DashboardOrder, paymentStatus: 'Paid' | 'Unpaid') {
    setModal((current) => (current ? { ...current, busy: true, error: null } : current))
    try {
      const updated = await apiClient.patch<DashboardOrder>(`/api/orders/${order.id}/pay`, { paymentStatus })

      if (order.fulfillmentStatus === 'Pending') {
        setPendingOrders((current) =>
          current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o)),
        )
        setModal((current) => (current ? { ...current, busy: false, error: null } : current))
        return
      }

      if (paymentStatus === 'Paid') {
        setExitingIds((current) => new Set(current).add(order.id))
        setModal((current) => (current ? { ...current, closing: true } : current))
        setTimeout(() => {
          setConfirmedUnpaidOrders((current) => current.filter((o) => o.id !== order.id))
          setCompletedTodayCount((count) => count + 1)
          bumpSummary()
          setExitingIds((current) => {
            const next = new Set(current)
            next.delete(order.id)
            return next
          })
          setModal(null)
        }, LANE_EXIT_MS)
      } else {
        setConfirmedUnpaidOrders((current) =>
          current.map((o) => (o.id === order.id ? { ...o, paymentStatus: updated.paymentStatus } : o)),
        )
        setModal((current) => (current ? { ...current, busy: false, error: null } : current))
      }
    } catch (err) {
      setModal((current) => (current ? { ...current, busy: false, error: errorMessage(err) } : current))
    }
  }

  const totalVisible = pendingOrders.length + confirmedUnpaidOrders.length

  return (
    <div className="order-rail">
      <div className="order-rail__status">
        <span className="order-rail__pulse" aria-hidden="true" />
        <span>Live — refreshes every few seconds</span>
        <span className={`order-rail__summary${summaryBump ? ' order-rail__summary--bump' : ''}`}>
          {completedTodayCount} completed today
        </span>
      </div>

      {totalVisible === 0 ? (
        <div className="order-rail__empty">
          <span className="order-rail__empty-eyebrow">All caught up</span>
          <p>No pending orders</p>
        </div>
      ) : (
        <>
          <section className="order-rail__lane" aria-label="Pending orders">
            <h2 className="order-rail__lane-heading">Pending</h2>
            {pendingOrders.length === 0 ? (
              <p className="order-rail__empty-eyebrow">No pending orders</p>
            ) : (
              <ul className="order-grid">
                {pendingOrders.map((order) => (
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

          {confirmedUnpaidOrders.length > 0 && (
            <section className="order-rail__lane" aria-label="Confirmed and unpaid orders">
              <h2 className="order-rail__lane-heading">Confirmed · awaiting payment</h2>
              <ul className="order-grid">
                {confirmedUnpaidOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    exiting={exitingIds.has(order.id)}
                    onOpen={() => openModal(order.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {modal && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          role={role}
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
