import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminTablesPage from './page'
import { requireRole } from '@/lib/authGuard'
import { listTables } from '@/lib/tableService'
import { generateQrDataUrl } from '@/lib/qrCode'

vi.mock('@/lib/authGuard', () => ({
  requireRole: vi.fn(),
}))

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

vi.mock('@/lib/qrCode', () => ({
  generateQrDataUrl: vi.fn(),
}))

vi.mock('./CreateTableForm', () => ({
  CreateTableForm: () => <div>Create Table Form</div>,
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Map([['host', 'localhost:3000']])),
}))

describe('AdminTablesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireRole).mockResolvedValue({ role: 'admin' })
    vi.mocked(listTables).mockResolvedValue([])
    vi.mocked(generateQrDataUrl).mockResolvedValue('data:image/png;base64,x')
  })

  it('is gated behind an admin session', async () => {
    await AdminTablesPage()

    expect(requireRole).toHaveBeenCalledWith('admin')
  })

  it('shows an empty state when there are no tables', async () => {
    const ui = await AdminTablesPage()
    render(ui)

    expect(screen.getByText('No tables yet — add one above.')).toBeInTheDocument()
  })

  it('shows the Table Setup heading and create form', async () => {
    const ui = await AdminTablesPage()
    render(ui)

    expect(screen.getByRole('heading', { name: 'Table Setup' })).toBeInTheDocument()
    expect(screen.getByText('Create Table Form')).toBeInTheDocument()
  })

  it('renders each table with its QR code', async () => {
    vi.mocked(listTables).mockResolvedValue([{ id: 't1', number: 3, createdAt: new Date() }] as never)

    const ui = await AdminTablesPage()
    render(ui)

    expect(screen.getByText('Table 3')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR code for table 3' })).toHaveAttribute(
      'src',
      'data:image/png;base64,x',
    )
  })
})
