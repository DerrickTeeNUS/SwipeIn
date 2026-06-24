import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, getDocs, setDoc } from 'firebase/firestore'
import SwipePage from '../pages/SwipePage'

const CURRENT_USER = { uid: 'user-1', role: 'student', displayName: 'Test User' }

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function makeDoc(uid, data) {
  return { id: uid, data: () => ({ ...data, uid }) }
}

function renderSwipe() {
  return render(
    <MemoryRouter>
      <SwipePage />
    </MemoryRouter>,
  )
}

describe('SwipePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: CURRENT_USER.uid })
      return () => {}
    })

    getDoc.mockResolvedValue({ exists: () => true, data: () => CURRENT_USER })
    getDocs.mockResolvedValue({ docs: [] })
    setDoc.mockResolvedValue(undefined)
  })

  it('shows a loading indicator while fetching profiles', () => {
    getDoc.mockReturnValue(new Promise(() => {})) // never resolves
    renderSwipe()
    expect(screen.getByText(/finding matches/i)).toBeInTheDocument()
  })

  it('redirects to /login when no user is authenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, callback) => {
      callback(null)
      return () => {}
    })

    renderSwipe()
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login')
    })
  })

  it('shows the empty state when there are no profiles to swipe', async () => {
    getDocs.mockResolvedValue({ docs: [] })
    renderSwipe()
    expect(await screen.findByText(/you've seen everyone/i)).toBeInTheDocument()
  })

  it('renders a profile card when profiles are available', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    expect(await screen.findByText('Maya Patel')).toBeInTheDocument()
  })

  it('shows Like and Pass action buttons when profiles are present', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Alice Brown', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Alice Brown')

    expect(screen.getByRole('button', { name: /like/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument()
  })

  it('filters out profiles the user has already swiped on', async () => {
    getDocs
      .mockResolvedValueOnce({
        docs: [
          makeDoc('prof-1', { displayName: 'Already Swiped', role: 'professional' }),
          makeDoc('prof-2', { displayName: 'Not Yet Swiped', role: 'professional' }),
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ to: 'prof-1' }) }] })

    renderSwipe()
    expect(await screen.findByText('Not Yet Swiped')).toBeInTheDocument()
    expect(screen.queryByText('Already Swiped')).not.toBeInTheDocument()
  })

  it('shows the match modal when a mutual like is detected', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Alex Kim', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ direction: 'like' }) })

    renderSwipe()
    fireEvent.click(await screen.findByRole('button', { name: /like/i }))

    expect(await screen.findByText(/it's a match/i)).toBeInTheDocument()
    // The modal subtitle is unique: "You and Alex Kim matched"
    expect(screen.getByText(/you and alex kim matched/i)).toBeInTheDocument()
  })

  it('closes the match modal when "Keep swiping" is clicked', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Alex Kim', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ direction: 'like' }) })

    renderSwipe()
    fireEvent.click(await screen.findByRole('button', { name: /like/i }))

    await screen.findByText(/it's a match/i)
    fireEvent.click(screen.getByRole('button', { name: /keep swiping/i }))

    await waitFor(() => {
      expect(screen.queryByText(/it's a match/i)).not.toBeInTheDocument()
    })
  })
})
