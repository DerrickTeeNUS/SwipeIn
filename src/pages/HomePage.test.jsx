import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import HomePage from './HomePage'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'

vi.mock('../firebase', () => ({
  auth: {},
  db: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  doc: vi.fn(() => ({})),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const renderHomePage = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  )

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when no user is authenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })

    renderHomePage()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('renders the dashboard when a user is authenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderHomePage()

    await waitFor(() => expect(screen.getByText('Welcome back, Alice')).toBeInTheDocument())
    expect(screen.getByText('SwipeIn dashboard')).toBeInTheDocument()
  })

  it('shows "Welcome back" without a name when displayName is absent', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: null }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    renderHomePage()

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Welcome back'))
  })

  it('links View Profile to /student/:uid for student role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/student/u1')
    )
  })

  it('links View Profile to /professional/:uid for professional role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Bob' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'professional' }) })

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/professional/u1')
    )
  })

  it('defaults View Profile to /student/:uid when role is empty', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Carol' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({}) })

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/student/u1')
    )
  })

  it('calls signOut and navigates to /login when Sign out is clicked', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })
    signOut.mockResolvedValue(undefined)

    renderHomePage()

    await waitFor(() => expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  it('handles Firestore error gracefully and keeps empty role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockRejectedValue(new Error('Firestore unavailable'))

    renderHomePage()

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/student/u1')
    )
  })

  it('renders Edit Profile, Messages, and Start swiping links', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /edit profile/i })).toHaveAttribute('href', '/profile')
      expect(screen.getByRole('link', { name: /messages/i })).toHaveAttribute('href', '/messages')
      expect(screen.getByRole('link', { name: /start swiping/i })).toHaveAttribute('href', '/swipe')
    })
  })

  it('renders all four feature cards', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderHomePage()

    await waitFor(() => {
      expect(screen.getByText('Find your best fit')).toBeInTheDocument()
      expect(screen.getByText('Connect with companies')).toBeInTheDocument()
      expect(screen.getByText('Track your applications')).toBeInTheDocument()
      expect(screen.getByText('Showcase your profile')).toBeInTheDocument()
    })
  })

  it('unsubscribes from auth listener on unmount', () => {
    const mockUnsubscribe = vi.fn()
    onAuthStateChanged.mockImplementation(() => mockUnsubscribe)

    const { unmount } = renderHomePage()
    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })
})
