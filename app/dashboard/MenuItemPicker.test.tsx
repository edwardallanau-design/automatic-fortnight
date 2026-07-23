import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MenuItemPicker } from './MenuItemPicker'
import type { PickerItem } from './MenuItemPicker'

const groups: Array<{ id: string; name: string; items: PickerItem[] }> = [
  {
    id: 'cat1',
    name: 'Espresso Drinks',
    items: [
      { id: 'm1', name: 'Latte', price: '5.00', available: true, countOnOrder: 0 },
      { id: 'm2', name: 'Mocha', price: '5.50', available: true, countOnOrder: 2 },
    ],
  },
  {
    id: 'cat2',
    name: 'Pastries',
    items: [{ id: 'm3', name: 'Scone', price: '3.50', available: false, countOnOrder: 0 }],
  },
]

describe('MenuItemPicker', () => {
  it('renders one heading per group, in the order given', () => {
    render(<MenuItemPicker groups={groups} disabled={false} onAdd={vi.fn()} />)

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h) => h.textContent)).toEqual(['Espresso Drinks', 'Pastries'])
  })

  it('disables a sold-out row and shows the sold-out badge', () => {
    render(<MenuItemPicker groups={groups} disabled={false} onAdd={vi.fn()} />)

    const sconeButton = screen.getByRole('button', { name: /Scone/ })
    expect(sconeButton).toBeDisabled()
    expect(screen.getByText('Sold out')).toBeInTheDocument()
  })

  it('shows the count digit only when countOnOrder is greater than zero, but always reserves the count column (ISSUE-31)', () => {
    render(<MenuItemPicker groups={groups} disabled={false} onAdd={vi.fn()} />)

    const mochaButton = screen.getByRole('button', { name: /Mocha/ })
    expect(mochaButton).toHaveTextContent('2')
    expect(mochaButton.querySelector('.menu-item-button__count')).toHaveTextContent('2')

    // The count cell must stay in the DOM (empty) rather than being omitted entirely -- omitting
    // it shifts every other row's price to a different x, which is the bug this fixes.
    const latteButton = screen.getByRole('button', { name: /Latte/ })
    expect(latteButton.querySelector('.menu-item-button__count')).toBeInTheDocument()
    expect(latteButton.querySelector('.menu-item-button__count')).toHaveTextContent('')
  })

  it('calls onAdd with the item id when an available row is clicked', async () => {
    const onAdd = vi.fn()
    render(<MenuItemPicker groups={groups} disabled={false} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: /Latte/ }))

    expect(onAdd).toHaveBeenCalledWith('m1')
  })

  it('does not call onAdd when a sold-out row is clicked', async () => {
    const onAdd = vi.fn()
    render(<MenuItemPicker groups={groups} disabled={false} onAdd={onAdd} />)

    await userEvent.click(screen.getByRole('button', { name: /Scone/ }))

    expect(onAdd).not.toHaveBeenCalled()
  })

  it('disables every row when disabled is true, even available ones', () => {
    render(<MenuItemPicker groups={groups} disabled={true} onAdd={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Latte/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Mocha/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Scone/ })).toBeDisabled()
  })
})
