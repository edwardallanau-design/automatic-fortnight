// app/order/new/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewOrderPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

describe('NewOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff' })
  })

  it('renders a link per table labeled with its number, pointing at /order?table=<id>', async () => {
    vi.mocked(listTables).mockResolvedValue([
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toHaveAttribute('href', '/order?table=t1')
    expect(screen.getByRole('link', { name: 'Table 2' })).toHaveAttribute('href', '/order?table=t2')
  })

  it('renders table number 0 as "Counter"', async () => {
    vi.mocked(listTables).mockResolvedValue([{ id: 't0', number: 0, createdAt: new Date() }] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Counter' })).toHaveAttribute('href', '/order?table=t0')
  })

  it('shows an empty-state message with a link to table setup when there are no tables', async () => {
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('renders for an admin session too', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listTables).mockResolvedValue([{ id: 't1', number: 1, createdAt: new Date() }] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toBeInTheDocument()
  })
})
