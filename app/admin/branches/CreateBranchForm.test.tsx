import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateBranchForm } from './CreateBranchForm'
import { apiClient, ApiError } from '@/lib/apiClient'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('@/lib/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiClient')>()
  return {
    ...actual,
    apiClient: { post: vi.fn() },
  }
})

describe('CreateBranchForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits name and password and refreshes on success', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({})
    render(<CreateBranchForm />)

    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Downtown' } })
    fireEvent.change(screen.getByLabelText('Staff password'), { target: { value: 'downtown-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/api/branches', { name: 'Downtown', password: 'downtown-pw' }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a conflict-specific error when the password is already in use', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new ApiError('CONFLICT', 'This password is already in use by another branch or the admin login'))
    render(<CreateBranchForm />)

    fireEvent.change(screen.getByLabelText('Branch name'), { target: { value: 'Downtown' } })
    fireEvent.change(screen.getByLabelText('Staff password'), { target: { value: 'taken-pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add branch' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is already in use by another branch or the admin login')
  })
})
