import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BranchSelector } from './BranchSelector'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/admin/tables',
}))

describe('BranchSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders an option per branch with the selected one chosen', () => {
    render(
      <BranchSelector
        branches={[
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Downtown' },
        ]}
        selectedBranchId="b2"
      />,
    )

    expect(screen.getByRole('combobox', { name: 'Branch' })).toHaveValue('b2')
    expect(screen.getByRole('option', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Downtown' })).toBeInTheDocument()
  })

  it('navigates to the current pathname with the new branch id on change', () => {
    render(
      <BranchSelector
        branches={[
          { id: 'b1', name: 'Main' },
          { id: 'b2', name: 'Downtown' },
        ]}
        selectedBranchId="b1"
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Branch' }), { target: { value: 'b2' } })

    expect(push).toHaveBeenCalledWith('/admin/tables?branch=b2')
  })
})
