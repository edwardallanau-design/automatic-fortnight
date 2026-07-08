import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('renders children inside a labeled dialog', () => {
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={vi.fn()}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument()
    expect(screen.getByText('Dialog content')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={onClose}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on backdrop click but not on a click inside the dialog', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop"
        backdropTestId="test-backdrop"
        dialogClassName="dialog"
        onClose={onClose}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByTestId('test-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('applies the given backdrop and dialog class names', () => {
    render(
      <Modal
        ariaLabel="Test dialog"
        backdropClassName="backdrop backdrop--exiting"
        backdropTestId="test-backdrop"
        dialogClassName="dialog dialog--exiting"
        onClose={vi.fn()}
      >
        <p>Dialog content</p>
      </Modal>,
    )

    expect(screen.getByTestId('test-backdrop')).toHaveClass('backdrop', 'backdrop--exiting')
    expect(screen.getByRole('dialog')).toHaveClass('dialog', 'dialog--exiting')
  })
})
