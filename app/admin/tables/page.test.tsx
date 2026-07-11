import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminTablesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listOrderingPoints } from '@/lib/orderingPointService'
import { resolveBranchId, listBranches } from '@/lib/branchService'
import { generateQrDataUrl } from '@/lib/qrCode'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/orderingPointService', () => ({
  listOrderingPoints: vi.fn(),
}))

vi.mock('@/lib/branchService', () => ({
  resolveBranchId: vi.fn(),
  listBranches: vi.fn(),
}))

vi.mock('@/lib/qrCode', () => ({
  generateQrDataUrl: vi.fn(),
}))

vi.mock('./CreateOrderingPointForm', () => ({
  CreateOrderingPointForm: () => <div>Create Table Form</div>,
}))

vi.mock('@/app/components/BranchSelector', () => ({
  BranchSelector: ({ branches }: { branches: { id: string; name: string }[] }) => (
    <div>Branch Selector ({branches.length})</div>
  ),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['host', 'localhost:3000']])),
}))

describe('AdminTablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(resolveBranchId).mockResolvedValue('b1')
    vi.mocked(listBranches).mockResolvedValue([{ id: 'b1', name: 'Main', acceptingOrders: true, createdAt: new Date() }] as never)
    vi.mocked(listOrderingPoints).mockResolvedValue([])
    vi.mocked(generateQrDataUrl).mockResolvedValue('data:image/png;base64,x')
  })

  function callPage(branch?: string) {
    return AdminTablesPage({ searchParams: Promise.resolve(branch ? { branch } : {}) })
  }

  it('is gated behind an admin session', async () => {
    await callPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('resolves the branch from the ?branch= query param', async () => {
    await callPage('b2')

    expect(resolveBranchId).toHaveBeenCalledWith({ role: 'admin' }, 'b2')
  })

  it('shows an empty state when there are no ordering points', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByText('No tables yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Table Setup heading, branch selector, and create form', async () => {
    const ui = await callPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.getByText('Branch Selector (1)')).toBeInTheDocument()
    expect(screen.getByText('Create Table Form')).toBeInTheDocument()
  })

  it('renders each ordering point with its QR code', async () => {
    vi.mocked(listOrderingPoints).mockResolvedValue([
      { id: 'op1', branchId: 'b1', label: 'Table 3', isCounter: false, createdAt: new Date() },
    ] as never)

    const ui = await callPage()
    render(ui)

    expect(screen.getByText('Table 3')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for Table 3' })).toHaveAttribute(
      'src',
      'data:image/png;base64,x',
    )
  })
})
