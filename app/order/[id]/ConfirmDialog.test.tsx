import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders the title, message, and confirm label', () => {
    render(
      <ConfirmDialog
        title="Cancel this order?"
        message="Staff won't receive it."
        confirmLabel="Yes, cancel"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Cancel this order?' })).toBeInTheDocument()
    expect(screen.getByText("Staff won't receive it.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yes, cancel' })).toBeInTheDocument()
  })

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when "Never mind" is clicked', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Never mind' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={onClose}
      />,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('confirm-dialog-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables both buttons when busy', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={true}
        exiting={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Never mind' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('adds an exiting class to the dialog when exiting is true', () => {
    render(
      <ConfirmDialog
        title="Remove item?"
        message="Remove Burger from your order?"
        confirmLabel="Remove"
        busy={false}
        exiting={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveClass('confirm-dialog--exiting')
  })
})
