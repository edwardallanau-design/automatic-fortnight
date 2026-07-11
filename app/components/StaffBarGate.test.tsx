import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StaffBarGate } from './StaffBarGate'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/dashboard',
}))

describe('StaffBarGate', () => {
  it('renders nothing when there is no session', () => {
    const { container } = render(<StaffBarGate session={null} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders the StaffBar with the session role when a session exists', () => {
    render(<StaffBarGate session={{ role: 'admin' }} />)

    expect(screen.getByText('admin')).toBeInTheDocument()
  })
})
