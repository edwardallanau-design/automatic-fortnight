import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import TestTablePage from './page'
import { listTables } from '@/lib/tableService'

vi.mock('@/lib/tableService', () => ({
  listTables: vi.fn(),
}))

describe('TestTablePage', () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.stubEnv('NODE_ENV', originalEnv ?? 'test')
  })

  it('shows a not-available message in production and does not call listTables', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const ui = await TestTablePage()
    render(ui)

    expect(screen.getByText("This page isn't available.")).toBeInTheDocument()
    expect(listTables).not.toHaveBeenCalled()
  })

  it('renders a link per table labeled with its number, pointing at /order?table=<id>', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.mocked(listTables).mockResolvedValue([
      { id: 't1', number: 1, createdAt: new Date() },
      { id: 't2', number: 2, createdAt: new Date() },
    ] as never)

    const ui = await TestTablePage()
    render(ui)

    const link1 = screen.getByRole('link', { name: 'Table 1' })
    const link2 = screen.getByRole('link', { name: 'Table 2' })
    expect(link1).toHaveAttribute('href', '/order?table=t1')
    expect(link2).toHaveAttribute('href', '/order?table=t2')
  })

  it('shows an empty-state message with a link to table setup when there are no tables', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.mocked(listTables).mockResolvedValue([])

    const ui = await TestTablePage()
    render(ui)

    expect(screen.getByText(/No tables yet\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Table setup' })).toHaveAttribute(
      'href',
      '/admin/tables',
    )
  })
})
