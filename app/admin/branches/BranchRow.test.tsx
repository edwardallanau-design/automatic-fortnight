import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BranchRow } from './BranchRow'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { patch: vi.fn() },
  }
})

describe('BranchRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the branch name and an accepting-orders toggle', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByRole('switch')).toBeChecked()
    expect(screen.getByText('Accepting orders')).toBeInTheDocument()
  })

  it('shows the toggle unchecked and labeled when closed', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={false} />)

    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByText('Not accepting orders')).toBeInTheDocument()
  })

  it('toggling calls PATCH with acceptingOrders and refreshes', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('switch'))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { acceptingOrders: false }))
    expect(refresh).toHaveBeenCalled()
  })

  it('hides Change name / Change password behind a collapsed actions row by default', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    expect(screen.queryByRole('button', { name: 'Change name' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show actions for Main' })).toBeInTheDocument()
  })

  it('reveals the actions row when the expand chevron is clicked, and hides it again on a second click', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    expect(screen.getByRole('button', { name: 'Change name' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide actions for Main' }))
    expect(screen.queryByRole('button', { name: 'Change name' })).not.toBeInTheDocument()
  })

  it('reveals a rename form when "Change name" is clicked, and saves it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    fireEvent.change(screen.getByLabelText('New name for Main'), { target: { value: 'Main Street' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { name: 'Main Street' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('reveals a password field when "Change password" is clicked, and submits it', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({})
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'new-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith('/api/branches/b1', { password: 'new-pw' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('only shows one edit form at a time, switching from name to password', () => {
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    expect(screen.getByLabelText('New name for Main')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    expect(screen.queryByLabelText('New name for Main')).not.toBeInTheDocument()
    expect(screen.getByLabelText('New password for Main')).toBeInTheDocument()
  })

  it('shows a conflict-specific error when the new password collides', async () => {
    vi.mocked(apiClient.patch).mockRejectedValue(new ApiError('CONFLICT', 'This password is already in use by another branch or the admin login'))
    render(<BranchRow id="b1" name="Main" acceptingOrders={true} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show actions for Main' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    fireEvent.change(screen.getByLabelText('New password for Main'), { target: { value: 'taken-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is already in use by another branch or the admin login')
  })
})
