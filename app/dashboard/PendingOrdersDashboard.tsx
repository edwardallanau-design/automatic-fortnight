'use client'

import { useEffect, useState } from 'react'
import { apiClient, ApiError } from '@/lib/apiClient'
import type { Role } from '@/lib/types'

const POLL_INTERVAL_MS = 3500

type PendingOrderItem = {
  id: string
  nameSnapshot: string
  priceSnapshot: string
  quantity: number
}

type PendingOrder = {
  id: string
  orderNumber: number
  createdAt: string
  paymentStatus: 'Unpaid' | 'Paid'
  table: { number: number }
  items: PendingOrderItem[]
}

type RowState = { submitting: boolean; error: string | null }

const EMPTY_ROW_STATE: RowState = { submitting: false, error: null }

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'
}

export function PendingOrdersDashboard({ role }: { role: Role }) {
  const [orders, setOrders] = useState<PendingOrder[]>([])
  const [rowState, setRowState] = useState<Record<string, RowState>>({})

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const result = await apiClient.get<PendingOrder[]>('/api/orders?status=pending')
        if (!cancelled) setOrders(result)
      } catch {
        // Transient poll failure: keep the last-known list, retry next tick.
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  async function handleConfirm(order: PendingOrder) {
    if (!window.confirm(`Confirm order #${order.orderNumber}?`)) return

    setRowState((current) => ({ ...current, [order.id]: { submitting: true, error: null } }))
    try {
      await apiClient.patch(`/api/orders/${order.id}/confirm`, {})
      setOrders((current) => current.filter((o) => o.id !== order.id))
      setRowState((current) => {
        const next = { ...current }
        delete next[order.id]
        return next
      })
    } catch (err) {
      setRowState((current) => ({ ...current, [order.id]: { submitting: false, error: errorMessage(err) } }))
    }
  }

  async function handleSetPaymentStatus(orderId: string, paymentStatus: 'Paid' | 'Unpaid') {
    setRowState((current) => ({ ...current, [orderId]: { submitting: true, error: null } }))
    try {
      const updated = await apiClient.patch<PendingOrder>(`/api/orders/${orderId}/pay`, { paymentStatus })
      setOrders((current) =>
        current.map((order) => (order.id === orderId ? { ...order, paymentStatus: updated.paymentStatus } : order)),
      )
      setRowState((current) => ({ ...current, [orderId]: { submitting: false, error: null } }))
    } catch (err) {
      setRowState((current) => ({ ...current, [orderId]: { submitting: false, error: errorMessage(err) } }))
    }
  }

  return (
    <div className="order-rail">
      <div className="order-rail__status">
        <span className="order-rail__pulse" aria-hidden="true" />
        <span>Live — refreshes every few seconds</span>
      </div>

      {orders.length === 0 ? (
        <div className="order-rail__empty">
          <span className="order-rail__empty-eyebrow">All caught up</span>
          <p>No pending orders</p>
        </div>
      ) : (
        <ul aria-label="Pending orders" className="order-grid">
          {orders.map((order) => {
            const { submitting, error } = rowState[order.id] ?? EMPTY_ROW_STATE
            const isPaid = order.paymentStatus === 'Paid'
            return (
              <li
                key={order.id}
                aria-label={`Order ${order.orderNumber}`}
                className={`order-card${isPaid ? '' : ' order-card--unpaid'}`}
              >
                <div className="order-card__head">
                  <span className="order-card__table">Table {order.table.number}</span>
                  <span className="order-card__number">#{order.orderNumber}</span>
                </div>
                <span className="order-card__time">{formatTimeAgo(order.createdAt)}</span>

                <ul className="order-card__items">
                  {order.items.map((item) => (
                    <li key={item.id} className="order-card__item">
                      {item.quantity}x {item.nameSnapshot}
                    </li>
                  ))}
                </ul>

                <div className="order-card__actions">
                  <button
                    type="button"
                    className="order-card__confirm"
                    disabled={submitting}
                    onClick={() => handleConfirm(order)}
                  >
                    Confirm
                  </button>
                  {order.paymentStatus === 'Unpaid' ? (
                    <button
                      type="button"
                      className="order-card__pay"
                      disabled={submitting}
                      onClick={() => handleSetPaymentStatus(order.id, 'Paid')}
                    >
                      Mark Paid
                    </button>
                  ) : role === 'admin' ? (
                    <button
                      type="button"
                      className="order-card__pay order-card__pay--revert"
                      disabled={submitting}
                      onClick={() => handleSetPaymentStatus(order.id, 'Unpaid')}
                    >
                      Mark Unpaid
                    </button>
                  ) : (
                    <span className="order-card__paid-badge">Paid</span>
                  )}
                </div>
                {error && (
                  <p role="alert" className="order-card__error">
                    {error}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
