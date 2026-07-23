import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuManager } from './MenuManager'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

const categories = [
  { id: 'c1', name: 'Mains', sortOrder: 0 },
  { id: 'c2', name: 'Drinks', sortOrder: 1 },
]
const items = [
  { id: 'm1', name: 'Burger', price: '12.50', available: true, category: categories[0] },
  { id: 'm2', name: 'Cola', price: '3.00', available: true, category: categories[1] },
  { id: 'm3', name: 'Mystery', price: '1.00', available: true, category: null },
]

describe('MenuManager', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders category groups in order with an Uncategorized group last (admin)', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Mains', 'Drinks', 'Uncategorized'])
  })

  it('shows admin affordances: Reorder button, per-group Add item, Add category', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: /Reorder categories/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Add item/ }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('button', { name: /Add category/ })).toBeInTheDocument()
  })

  it('hides all admin affordances for a staff (non-admin) session', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: /Reorder categories/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add item/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add category/ })).not.toBeInTheDocument()
    // staff still sees items + interactive availability toggles
    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getAllByRole('switch').length).toBe(3)
  })

  it('hides the Reorder button when fewer than two categories exist', () => {
    render(<MenuManager items={[items[0]]} categories={[categories[0]]} branchId="b1" isAdmin={true} />)
    expect(screen.queryByRole('button', { name: /Reorder categories/ })).not.toBeInTheDocument()
  })

  it('enters reorder mode when Reorder categories is clicked, showing reorder bars', () => {
    render(<MenuManager items={items} categories={categories} branchId="b1" isAdmin={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Reorder categories/ }))
    expect(screen.getAllByTestId('reorder-bar').length).toBe(2)
    // normal add affordances hidden while reordering
    expect(screen.queryByRole('button', { name: /Add category/ })).not.toBeInTheDocument()
  })

  it('shows empty categories for admin (so items can be added into them)', () => {
    render(<MenuManager items={[]} categories={categories} branchId="b1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: /Edit Mains/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit Drinks/ })).toBeInTheDocument()
    // one "+ Add item" footer per (empty) category
    expect(screen.getAllByRole('button', { name: /Add item/ })).toHaveLength(2)
  })

  it('drops empty categories for staff (customer-like view)', () => {
    render(<MenuManager items={[]} categories={categories} branchId="b1" isAdmin={false} />)
    expect(screen.queryByText('Mains')).not.toBeInTheDocument()
    expect(screen.queryByText('Drinks')).not.toBeInTheDocument()
  })
})
