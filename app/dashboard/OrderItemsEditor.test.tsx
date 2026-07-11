import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderItemsEditor } from './OrderItemsEditor'
import type { OrderCardItem } from './OrderCard'

const twoItems: OrderCardItem[] = [
  { id: 'i1', nameSnapshot: 'Burger', priceSnapshot: '12.50', quantity: 2 },
  { id: 'i2', nameSnapshot: 'Fries', priceSnapshot: '4.00', quantity: 1 },
]

const menuItems = [{ id: 'm3', name: 'Cola', price: '3.00' }]

describe('OrderItemsEditor', () => {
  it('renders each line with its name, quantity, and price', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByText('Burger')).toBeInTheDocument()
    expect(screen.getByText('$25.00')).toBeInTheDocument()
    expect(screen.getByText('Fries')).toBeInTheDocument()
    expect(screen.getByText('$4.00')).toBeInTheDocument()
  })

  it('calls onAdjustQuantity with quantity+1/-1 when the stepper buttons are clicked', async () => {
    const onAdjustQuantity = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={onAdjustQuantity}
        onRemoveItem={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Increase Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 3)

    await user.click(screen.getByRole('button', { name: 'Decrease Burger quantity' }))
    expect(onAdjustQuantity).toHaveBeenCalledWith('i1', 1)
  })

  it('disables the decrease button at quantity 1', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Decrease Fries quantity' })).toBeDisabled()
  })

  it('hides the remove button for the only remaining line (INV-2)', () => {
    render(
      <OrderItemsEditor
        items={[twoItems[0]]}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Remove Burger' })).not.toBeInTheDocument()
  })

  it('opens a confirm dialog before removing a line, and calls onRemoveItem only after confirming', async () => {
    const onRemoveItem = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={onRemoveItem}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove Fries' }))
    expect(onRemoveItem).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Remove item?' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveItem).toHaveBeenCalledWith('i2')
  })

  it('adds an item from the picker and resets the selection', async () => {
    const onAddItem = vi.fn()
    const user = userEvent.setup()
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={onAddItem}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Add an item' }), 'm3')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onAddItem).toHaveBeenCalledWith('m3')
    expect(screen.getByRole('combobox', { name: 'Add an item' })).toHaveValue('')
  })

  it('disables the Add button until an item is selected', () => {
    render(
      <OrderItemsEditor
        items={twoItems}
        busy={false}
        menuItems={menuItems}
        onAddItem={vi.fn()}
        onAdjustQuantity={vi.fn()}
        onRemoveItem={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
  })
})
