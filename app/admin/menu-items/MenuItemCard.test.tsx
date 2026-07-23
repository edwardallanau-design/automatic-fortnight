import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MenuItemCard } from './MenuItemCard'
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

describe('MenuItemCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('read-only (non-editable) session', () => {
    it('shows name and price with no Edit button', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.getByText('$12.50')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    })

    it('shows an availability toggle checked and labeled Available when available', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      expect(screen.getByRole('switch')).toBeChecked()
      expect(screen.getByText('Available')).toBeInTheDocument()
    })

    it('shows the availability toggle unchecked and labeled Sold out when unavailable', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={false} editable={false} branchId="b1" />)

      expect(screen.getByRole('switch')).not.toBeChecked()
      expect(screen.getByText('Sold out')).toBeInTheDocument()
    })

    it('toggling availability calls the availability endpoint and does not open edit mode', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      fireEvent.click(screen.getByRole('switch'))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1/availability', { available: false, branchId: 'b1' })
      await waitFor(() => expect(refresh).toHaveBeenCalled())
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('reverts the toggle and shows an error when the availability request fails', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('FORBIDDEN', 'Insufficient role for this action'))
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      fireEvent.click(screen.getByRole('switch'))

      expect(await screen.findByRole('alert')).toHaveTextContent('Insufficient role for this action')
      expect(screen.getByRole('switch')).toBeChecked()
    })
  })

  describe('editable session, read-only by default', () => {
    it('shows an Edit button and no input fields until Edit is clicked', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      expect(screen.getByRole('button', { name: /Edit Burger/ })).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('reveals inputs and Save/Cancel/Archive after clicking Edit, without the availability toggle', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))

      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
      expect(screen.getByLabelText('Price for Burger')).toBeInTheDocument()
      // availability lives on the collapsed row only — it's not part of the edit form
      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    })
  })

  describe('Cancel', () => {
    it('discards unsaved edits and returns to read-only without calling the API', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.queryByText('Cheeseburger')).not.toBeInTheDocument()
      expect(apiClient.patch).not.toHaveBeenCalled()
      expect(apiClient.del).not.toHaveBeenCalled()
    })
  })

  describe('Save', () => {
    it('calls PATCH with the edited name/price (no available field) and returns to read-only on success', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.change(screen.getByLabelText('Name for Burger'), { target: { value: 'Cheeseburger' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1', {
        name: 'Cheeseburger',
        price: 12.5,
        categoryId: null,
      })

      expect(await screen.findByText('Burger')).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
      expect(refresh).toHaveBeenCalled()
    })

    it('shows an error and stays in editing state when the save fails', async () => {
      vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('VALIDATION', 'Price must be positive'))
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Price must be positive')
      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
    })
  })

  describe('Archive', () => {
    it('opens a confirm dialog instead of calling DELETE immediately', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      expect(screen.getByRole('dialog', { name: 'Archive Burger?' })).toBeInTheDocument()
      expect(apiClient.del).not.toHaveBeenCalled()
    })

    it('calls DELETE only after the dialog is confirmed', () => {
      vi.mocked(apiClient.del).mockResolvedValue(undefined)
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

      const dialog = screen.getByRole('dialog', { name: 'Archive Burger?' })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

      expect(apiClient.del).toHaveBeenCalledWith('/api/menu-items/m1')
    })

    it('does not call DELETE when "Never mind" is clicked', async () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
      fireEvent.click(screen.getByRole('button', { name: 'Never mind' }))

      expect(apiClient.del).not.toHaveBeenCalled()

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('category', () => {
    // In the mirror design the collapsed row shows only name + price (the
    // customer look); which category an item belongs to is conveyed by the
    // group heading it sits under, not inline text (that grouping is covered
    // by MenuManager/page tests). The collapsed row therefore renders no
    // category text — the edit form's <select> is the only category surface.
    it('does not render inline category text in the collapsed view', () => {
      render(
        <MenuItemCard
          id="m1"
          name="Burger"
          price="12.50"
          available={true}
          editable={false}
          branchId="b1"
          categoryId="c1"
        />,
      )

      expect(screen.queryByText('Mains')).not.toBeInTheDocument()
      expect(screen.queryByText('Uncategorized')).not.toBeInTheDocument()
    })

    it('does not show a category select for a non-editable session', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)

      expect(screen.queryByLabelText('Category for Burger')).not.toBeInTheDocument()
    })

    it('shows a category select with "No category" plus every category once editing starts', () => {
      render(
        <MenuItemCard
          id="m1"
          name="Burger"
          price="12.50"
          available={true}
          editable={true}
          branchId="b1"
          categories={[
            { id: 'c1', name: 'Mains' },
            { id: 'c2', name: 'Drinks' },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))

      const select = screen.getByLabelText('Category for Burger')
      expect(within(select).getByRole('option', { name: 'No category' })).toBeInTheDocument()
      expect(within(select).getByRole('option', { name: 'Mains' })).toBeInTheDocument()
      expect(within(select).getByRole('option', { name: 'Drinks' })).toBeInTheDocument()
    })

    it('preselects the current category when editing starts', () => {
      render(
        <MenuItemCard
          id="m1"
          name="Burger"
          price="12.50"
          available={true}
          editable={true}
          branchId="b1"
          categoryId="c1"
          categories={[
            { id: 'c1', name: 'Mains' },
            { id: 'c2', name: 'Drinks' },
          ]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))

      expect(screen.getByLabelText('Category for Burger')).toHaveValue('c1')
    })

    it('sends the selected categoryId on Save', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(
        <MenuItemCard
          id="m1"
          name="Burger"
          price="12.50"
          available={true}
          editable={true}
          branchId="b1"
          categories={[{ id: 'c1', name: 'Mains' }]}
        />,
      )

      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      fireEvent.change(screen.getByLabelText('Category for Burger'), { target: { value: 'c1' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(apiClient.patch).toHaveBeenCalledWith('/api/menu-items/m1', {
        name: 'Burger',
        price: 12.5,
        categoryId: 'c1',
      })
    })
  })

  describe('expand/collapse via the row', () => {
    it('renders the collapsed row as an Edit button for an editable session', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      expect(screen.getByRole('button', { name: /Edit Burger/ })).toBeInTheDocument()
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })

    it('expands the edit form when the collapsed row is clicked', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      fireEvent.click(screen.getByRole('button', { name: /Edit Burger/ }))
      expect(screen.getByLabelText('Name for Burger')).toBeInTheDocument()
    })

    it('does not render an Edit affordance for a non-editable (staff) session', () => {
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={false} branchId="b1" />)
      expect(screen.queryByRole('button', { name: /Edit Burger/ })).not.toBeInTheDocument()
      expect(screen.getByText('Burger')).toBeInTheDocument()
      expect(screen.getByRole('switch')).toBeInTheDocument()
    })

    it('toggling availability on the collapsed row does not expand the edit form', () => {
      vi.mocked(apiClient.patch).mockResolvedValue({})
      render(<MenuItemCard id="m1" name="Burger" price="12.50" available={true} editable={true} branchId="b1" />)
      fireEvent.click(screen.getByRole('switch'))
      expect(screen.queryByLabelText('Name for Burger')).not.toBeInTheDocument()
    })
  })
})
