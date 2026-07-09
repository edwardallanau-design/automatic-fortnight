import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MenuItemRow } from './MenuItemRow'
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

describe('MenuItemRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('read-only (non-editable) session', () => {
    it('shows name, price, and availability badge with no Edit button', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={false} />)

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.getByText('$12.50')).toBeInTheDocument()
      expect(screen.getByText('Available')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })

    it('shows "Sold out" when unavailable', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={false} editable={false} />)

      expect(screen.getByText('Sold out')).toBeInTheDocument()
    })
  })

  describe('editable session, read-only by default', () => {
    it('shows an Edit button and no input fields until Edit is clicked', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('reveals inputs and Save/Cancel/Archive after clicking Edit', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
      expect(screen.getByLabelText('Price for Burger')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    })
  })

  describe('Cancel', () => {
    it('discards unsaved edits and returns to read-only without calling the API', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.queryByText('Cheeseburger')).not.toBeInTheDocument()
      expect(apiClient.patch).not.toHaveBeenCalled()
      expect(apiClient.del).not.toHaveBeenCalled()
    })
  })

  describe('Save', () => {
    it('calls PATCH with the edited fields and returns to read-only on success', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1', {
        name: 'Cheeseburger',
        price: 12.5,
        available: true,
      })

      expect(await screen.findByText('Burger')).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
      expect(refresh).toHaveBeenCalled()
    })

    it('shows an error and stays in editing state when the save fails', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'Price must be positive'))
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Price must be positive')
      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
    })
  })

  describe('Archive', () => {
    it('opens a confirm dialog instead of calling DELETE immediately', () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      expect(screen.getByRole('dialog', { name: 'Archive Burger?' })).toBeInTheDocument()
      expect(apiClient.del).not.toHaveBeenCalled()
    })

    it('calls DELETE only after the dialog is confirmed', () => {
      vi.mocked(apiClient.del).mockResolvedValue({})
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      const dialog = screen.getByRole('dialog', { name: 'Archive Burger?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

      expect(apiClient.del).toHaveBeenCalledWith('/api/menu-items/m1')
    })

    it('does not call DELETE when "Never mind" is clicked', async () => {
      render(<MenuItemRow id="m1" name="Burger" price="12.50" available={true} editable={true} />)

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
      fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(apiClient.del).not.toHaveBeenCalled()

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })
})
