import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { CategoryHeader } from './CategoryHeader'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { patch: vi.fn(), del: vi.fn() },
  }
})

describe('CategoryHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a plain, non-interactive heading when interactive is false', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={false} />)
    expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Drinks/ })).not.toBeInTheDocument()
  })

  it('renders the heading as an Edit button when interactive is true', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)
    expect(screen.getByRole('button', { name: /Edit Drinks/ })).toBeInTheDocument()
  })

  it('expands rename + delete controls when the heading is clicked', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)
    fireEvent.click(screen.getByRole('button', { name: /Edit Drinks/ }))
    expect(screen.getByLabelText('Name for Drinks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('shows the name as an Edit button by default, with no input', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    expect(screen.getByRole('button', { name: 'Edit Drinks' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Name for Drinks')).not.toBeInTheDocument()
  })

  it('reveals a name input and Save/Cancel/Delete after clicking the heading', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))

    expect(screen.getByLabelText('Name for Drinks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('Cancel discards the edit without calling the API', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.change(screen.getByLabelText('Name for Drinks'), { target: { value: 'Beverages' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Edit Drinks' })).toBeInTheDocument()
    expect(screen.queryByText('Beverages')).not.toBeInTheDocument()
    expect(apiClient.patch).not.toHaveBeenCalled()
  })

  it('Save calls PATCH with the edited name and returns to read-only on success', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.change(screen.getByLabelText('Name for Drinks'), { target: { value: 'Beverages' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(apiClient.patch).toHaveBeenCalledWith('/api/categories/c1', { name: 'Beverages' })
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('shows an error and stays in editing state when Save fails', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'name is required'))
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('name is required')
    expect(screen.getByLabelText('Name for Drinks')).toBeInTheDocument()
  })

  it('opens a confirm dialog instead of deleting immediately', () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('dialog', { name: 'Delete Drinks?' })).toBeInTheDocument()
    expect(apiClient.del).not.toHaveBeenCalled()
  })

  it('calls DELETE only after the dialog is confirmed', () => {
    vi.mocked(apiClient.del).mockResolvedValue(undefined)
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Drinks?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(apiClient.del).toHaveBeenCalledWith('/api/categories/c1')
  })

  it('does not call DELETE when "Never mind" is clicked', async () => {
    render(<CategoryHeader id="c1" name="Drinks" interactive={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Drinks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

    expect(apiClient.del).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
