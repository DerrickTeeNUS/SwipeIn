import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, getDocs, setDoc } from 'firebase/firestore'
import SwipePage from './SwipePage'

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

  it('filters the feed by industry and location for student users', async () => {
    getDocs
      .mockResolvedValueOnce({
        docs: [
          makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional', location: 'New York', industry: 'technology' }),
          makeDoc('prof-2', { displayName: 'Chris Lee', role: 'professional', location: 'Boston', industry: 'finance' }),
        ],
      })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    expect(await screen.findByText('Maya Patel')).toBeInTheDocument()

    const industryInput = screen.getByLabelText(/industry/i)
    fireEvent.change(industryInput, { target: { value: 'technology' } })
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'new york' } })

    await waitFor(() => {
      expect(screen.queryByText('Chris Lee')).not.toBeInTheDocument()
    })
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

  // ─── View profile link ─────────────────────────────────────────────────────

  it('shows a "View profile" link on the top card linking to the correct profile route', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')

    const link = screen.getByRole('link', { name: /view profile/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/professional/prof-1')
  })

  it('links to the student route for a student profile', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...CURRENT_USER, role: 'professional' }) })
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('stu-1', { displayName: 'Alice', role: 'student' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Alice')

    expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/student/stu-1')
  })

  // ─── Report feature ────────────────────────────────────────────────────────

  it('shows a Report button on the top card when profiles are present', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    expect(screen.getByRole('button', { name: /report profile/i })).toBeInTheDocument()
  })

  it('opens the ReportModal when the Report button is clicked', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))

    expect(await screen.findByText(/why are you reporting maya patel/i)).toBeInTheDocument()
  })

  it('closes the ReportModal when Cancel is clicked', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))
    await screen.findByText(/why are you reporting maya patel/i)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })

  it('writes a report document and a pass-swipe to Firestore on submission', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Harassment' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reporterId: 'user-1', reportedId: 'prof-1', reason: 'Harassment' }),
      )
    })
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: 'user-1', to: 'prof-1', direction: 'pass' }),
    )
  })

  it('removes the reported profile from the deck immediately after submission', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Spam or fake profile' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(screen.queryByText('Maya Patel')).not.toBeInTheDocument()
    })
    expect(await screen.findByText(/you've seen everyone/i)).toBeInTheDocument()
  })

  it('shows a "Profile reported" toast after submission', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Inappropriate content' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    expect(await screen.findByRole('status')).toHaveTextContent('Profile reported')
  })

  it('closes the ReportModal after submission', async () => {
    getDocs
      .mockResolvedValueOnce({ docs: [makeDoc('prof-1', { displayName: 'Maya Patel', role: 'professional' })] })
      .mockResolvedValueOnce({ docs: [] })

    renderSwipe()
    await screen.findByText('Maya Patel')
    fireEvent.click(screen.getByRole('button', { name: /report profile/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Misleading information' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })
})
