import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddCategoryRow } from './AddCategoryRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { post: vi.fn() } }
})

describe('AddCategoryRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a collapsed "+ Add category" button by default', () => {
    render(<AddCategoryRow />)
    expect(screen.getByRole('button', { name: /Add category/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('New category name')).not.toBeInTheDocument()
  })

  it('POSTs the category name and refreshes on Add', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'c9' } as never)
    render(<AddCategoryRow />)

    fireEvent.click(screen.getByRole('button', { name: /Add category/ }))
    fireEvent.change(screen.getByLabelText('New category name'), { target: { value: 'Desserts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/categories', { name: 'Desserts' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows an error and stays expanded when the POST fails', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('VALIDATION', 'name is required'))
    render(<AddCategoryRow />)

    fireEvent.click(screen.getByRole('button', { name: /Add category/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(screen.getByLabelText('New category name')).toBeInTheDocument()
  })
})
