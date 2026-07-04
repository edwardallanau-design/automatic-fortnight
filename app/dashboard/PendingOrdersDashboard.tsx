'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/apiClient'

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
  table: { number: number }
  items: PendingOrderItem[]
}

function formatTimeAgo(createdAt: string): string {
  const elapsedMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  return elapsedMinutes < 1 ? 'just now' : `${elapsedMinutes} min ago`
}

export function PendingOrdersDashboard() {
  const [orders, setOrders] = useState<PendingOrder[]>([])

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

  if (orders.length === 0) {
    return <p>No pending orders</p>
  }

  return (
    <ul aria-label="Pending orders">
      {orders.map((order) => (
        <li key={order.id} aria-label={`Order ${order.orderNumber}`}>
          <span>Table {order.table.number}</span>
          <span>#{order.orderNumber}</span>
          <span>{formatTimeAgo(order.createdAt)}</span>
          <ul>
            {order.items.map((item) => (
              <li key={item.id}>
                {item.quantity}x {item.nameSnapshot}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
