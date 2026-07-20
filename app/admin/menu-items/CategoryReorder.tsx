'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, ApiError } from '@/lib/apiClient'

type Cat = { id: string; name: string }

export function CategoryReorder({ categories, onClose }: { categories: Cat[]; onClose: () => void }) {
  const router = useRouter()
  const [order, setOrder] = useState<string[]>(categories.map((c) => c.id))
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const byId = new Map(categories.map((c) => [c.id, c]))

  function move(id: string, delta: number) {
    setOrder((prev) => {
      const i = prev.indexOf(id)
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  // While dragging, listen on window so pointer capture / element boundaries don't
  // drop events; find the bar whose midpoint the pointer has crossed and move the
  // dragging id there. Re-attached whenever the draft order changes (short list).
  useEffect(() => {
    if (!draggingId) return
    function onMove(e: PointerEvent) {
      const list = listRef.current
      if (!list) return
      const bars = Array.from(list.querySelectorAll('[data-cat-id]')) as HTMLElement[]
      let targetIndex = order.length - 1
      for (let k = 0; k < bars.length; k++) {
        const rect = bars[k].getBoundingClientRect()
        if (e.clientY < rect.top + rect.height / 2) {
          targetIndex = k
          break
        }
      }
      setOrder((prev) => {
        const from = prev.indexOf(draggingId!)
        if (from === -1 || from === targetIndex) return prev
        const next = [...prev]
        next.splice(from, 1)
        next.splice(targetIndex, 0, draggingId!)
        return next
      })
    }
    function onUp() {
      setDraggingId(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [draggingId, order])

  async function handleDone() {
    setSubmitting(true)
    setError(null)
    try {
      await apiClient.patch('/api/categories/reorder', { orderedIds: order })
      router.refresh()
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="category-reorder">
      <p className="category-reorder__hint">Drag to reorder, or use the arrows. Nothing saves until you tap Done.</p>
      <ul className="category-reorder__list" ref={listRef}>
        {order.map((id, index) => {
          const cat = byId.get(id)
          if (!cat) return null
          return (
            <li
              key={id}
              data-cat-id={id}
              data-testid="reorder-bar"
              className={`category-reorder__bar${draggingId === id ? ' category-reorder__bar--dragging' : ''}`}
            >
              <button
                type="button"
                className="category-reorder__grip"
                aria-label={`Drag ${cat.name}`}
                onPointerDown={() => setDraggingId(id)}
              >
                ⠿
              </button>
              <span className="category-reorder__name">{cat.name}</span>
              <button
                type="button"
                className="category-reorder__move"
                aria-label={`Move ${cat.name} up`}
                onClick={() => move(id, -1)}
                disabled={index === 0 || submitting}
              >
                ▲
              </button>
              <button
                type="button"
                className="category-reorder__move"
                aria-label={`Move ${cat.name} down`}
                onClick={() => move(id, 1)}
                disabled={index === order.length - 1 || submitting}
              >
                ▼
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p role="alert" className="category-reorder__error">
          {error}
        </p>
      )}
      <div className="category-reorder__actions">
        <button type="button" className="category-reorder__done" onClick={handleDone} disabled={submitting}>
          Done
        </button>
        <button type="button" className="category-reorder__cancel" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
      </div>
    </div>
  )
}
