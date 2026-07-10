import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateOrderingPointForm } from './CreateOrderingPointForm'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  }
})

describe('CreateOrderingPointForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits the label and refreshes on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    render(<CreateOrderingPointForm />)

    fireEvent.change(screen.getByLabelText('Table label'), { target: { value: 'Patio 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add table' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/ordering-points', { label: 'Patio 1' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a conflict-specific error when the label already exists', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('CONFLICT', 'already exists'))
    render(<CreateOrderingPointForm />)

    fireEvent.change(screen.getByLabelText('Table label'), { target: { value: 'Patio 1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add table' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A table with that label already exists')
  })
})
