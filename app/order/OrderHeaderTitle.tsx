'use client'

import { useEffect, useState } from 'react'
import { readOrderName } from './orderNameStorage'

export function OrderHeaderTitle({ tableId, label }: { tableId: string; label: string }) {
  // Read in an effect, not during render: sessionStorage does not exist on the server,
  // and the server-rendered HTML must match the first client render.
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    setName(readOrderName(tableId))
  }, [tableId])

  return (
    <h1 className="order-header__title">
      {label}
      {name && <span className="order-header__name"> · {name}</span>}
    </h1>
  )
}
