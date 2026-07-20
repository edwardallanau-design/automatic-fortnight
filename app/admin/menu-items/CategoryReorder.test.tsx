import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CategoryReorder } from './CategoryReorder'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { patch: vi.fn() } }
})

const categories = [
  { id: 'c1', name: 'Mains' },
  { id: 'c2', name: 'Drinks' },
  { id: 'c3', name: 'Desserts' },
]

describe('CategoryReorder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every category as a reorder bar in current order', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    const bars = screen.getAllByTestId('reorder-bar').map((b) => b.textContent)
    expect(bars[0]).toContain('Mains')
    expect(bars[1]).toContain('Drinks')
    expect(bars[2]).toContain('Desserts')
  })

  it('disables move-up on the first bar and move-down on the last', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Move Mains up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Desserts down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Mains down' })).not.toBeDisabled()
  })

  it('keyboard move-down reorders the draft (Mains after Drinks)', () => {
    render(<CategoryReorder categories={categories} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move Mains down' }))
    const bars = screen.getAllByTestId('reorder-bar').map((b) => b.textContent)
    expect(bars[0]).toContain('Drinks')
    expect(bars[1]).toContain('Mains')
  })

  it('Done commits the current draft order and refreshes then closes', async () => {
    const onClose = vi.fn()
    vi.mocked(apiClient.patch).mockResolvedValue({} as never)
    render(<CategoryReorder categories={categories} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Mains down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    await waitFor(() =>
      expect(apiClient.patch).toHaveBeenCalledWith('/api/categories/reorder', { orderedIds: ['c2', 'c1', 'c3'] }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('Cancel closes without any request', () => {
    const onClose = vi.fn()
    render(<CategoryReorder categories={categories} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(apiClient.patch).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('a failed Done shows an inline error and keeps the mode open (no close)', async () => {
    const onClose = vi.fn()
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'orderedIds must contain each existing category id exactly once'))
    render(<CategoryReorder categories={categories} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('orderedIds must contain')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getAllByTestId('reorder-bar')).toHaveLength(3)
  })
})
