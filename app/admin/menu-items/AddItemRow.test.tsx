import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddItemRow } from './AddItemRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return { ...actual, apiClient: { post: vi.fn(), patch: vi.fn() } }
})

describe('AddItemRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a collapsed "+ Add item" button, no form, by default', () => {
    render(<AddItemRow categoryId="c1" />)
    expect(screen.getByRole('button', { name: /Add item/ })).toBeInTheDocument()
    expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument()
  })

  it('reveals name + price fields when expanded', () => {
    render(<AddItemRow categoryId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    expect(screen.getByLabelText('New item name')).toBeInTheDocument()
    expect(screen.getByLabelText('New item price')).toBeInTheDocument()
  })

  it('POSTs the item then PATCHes its categoryId to the enclosing category', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'new1' } as never)
    vi.mocked(apiClient.patch).mockResolvedValue({} as never)
    render(<AddItemRow categoryId="c1" />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Espresso' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/menu-items', { name: 'Espresso', price: 3 }))
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/new1', { categoryId: 'c1' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('skips the categoryId PATCH for the Uncategorized group (categoryId null)', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'new1' } as never)
    render(<AddItemRow categoryId={null} />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Mystery' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalled())
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('shows an error and stays expanded when the POST fails (item never created, no PATCH)', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('VALIDATION', 'price is required and must be a positive number'))
    render(<AddItemRow categoryId="c1" />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('price is required')
    expect(screen.getByLabelText('New item name')).toBeInTheDocument()
    // POST failed → nothing was created → no category PATCH is attempted
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('collapses and refreshes (not blind-retryable) when the POST succeeds but the category PATCH fails', async () => {
    // The item already exists after the POST; retrying the whole flow would
    // create a duplicate, so we close + refresh so the admin re-files the
    // now-uncategorized item instead of re-adding it.
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'new1' } as never)
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('INTERNAL_ERROR', 'Something went wrong'))
    render(<AddItemRow categoryId="c1" />)

    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Mango' } })
    fireEvent.change(screen.getByLabelText('New item price'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/api/menu-items', { name: 'Mango', price: 6 }))
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/new1', { categoryId: 'c1' }))
    // form collapses and the page refreshes so the created item is visible
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument())
  })

  it('collapses without calling the API when Cancel is clicked', () => {
    render(<AddItemRow categoryId="c1" />)
    fireEvent.click(screen.getByRole('button', { name: /Add item/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('New item name')).not.toBeInTheDocument()
    expect(apiClient.post).not.toHaveBeenCalled()
  })
})
