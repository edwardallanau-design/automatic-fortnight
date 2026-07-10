// app/order/new/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NewOrderPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId } from '@/lib/branchService'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/orderingPointService', () => ({
  listOrderingPoints: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
}))

describe('NewOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'staff', branchId: 'b1' })
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
  })

  it('renders a link per ordering point labeled with its label, pointing at /order?table=<id>', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't1', branchId: 'b1', label: 'Table 1', isCounter: false, createdAt: new Date() },
      { id: 't2', branchId: 'b1', label: 'Table 2', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toHaveAttribute('href', '/order?table=t1')
    expect(screen.getByRole('link', { name: 'Table 2' })).toHaveAttribute('href', '/order?table=t2')
  })

  it('renders the Counter ordering point by its stored label', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't0', branchId: 'b1', label: 'Counter', isCounter: true, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Counter' })).toHaveAttribute('href', '/order?table=t0')
  })

  it('shows an empty-state message with a link to table setup when there are no ordering points', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([])

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute('href', '/admin/tables')
  })

  it('renders for an admin session too, resolving branch via resolveBranchId', async () => {
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 't1', branchId: 'b1', label: 'Table 1', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await NewOrderPage()
    render(ui)

    expect(screen.getByRole('link', { name: 'Table 1' })).toBeInTheDocument()
    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' })
  })
})
