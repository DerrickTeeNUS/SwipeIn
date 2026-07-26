import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, setDoc } from 'firebase/firestore'
import StudentProfilePage from './StudentProfilePage'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage(uid = 'stu-1') {
  return render(
    <MemoryRouter initialEntries={[`/student/${uid}`]}>
      <Routes>
        <Route path="/student/:uid" element={<StudentProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function authAs(uid) {
  onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid }); return vi.fn() })
}

const STUDENT_PROFILE = {
  role: 'student',
  displayName: 'Alice Johnson',
  bio: 'CS student at NYU',
  location: 'New York, NY',
  about: 'Passionate about tech and building things.',
  university: 'NYU',
  major: 'Computer Science',
  gradYear: '2026',
  skills: ['React', 'Python'],
  portfolioURL: 'https://github.com/alice',
  linkedinURL: 'https://linkedin.com/in/alice',
}

describe('StudentProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authAs('viewer-1')
  })

  // ─── Auth guard ────────────────────────────────────────────────────────────

  it('redirects to /login when unauthenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('unsubscribes from auth listener on unmount', () => {
    const mockUnsub = vi.fn()
    onAuthStateChanged.mockReturnValue(mockUnsub)
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    const { unmount } = renderPage()
    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })

  // ─── Loading & not found ───────────────────────────────────────────────────

  it('shows a loading indicator while the profile is being fetched', () => {
    getDoc.mockReturnValue(new Promise(() => {})) // never resolves
    renderPage()
    expect(screen.getByText('Loading profile…')).toBeInTheDocument()
  })

  it('shows "Profile not found" when the document does not exist', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    renderPage()
    expect(await screen.findByText('Profile not found')).toBeInTheDocument()
  })

  it('shows "Profile not found" when the uid belongs to a professional', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'professional', displayName: 'Bob' }) })
    renderPage()
    expect(await screen.findByText('Profile not found')).toBeInTheDocument()
  })

  it('shows "Profile not found" when Firestore throws', async () => {
    getDoc.mockRejectedValue(new Error('Permission denied'))
    renderPage()
    expect(await screen.findByText('Profile not found')).toBeInTheDocument()
  })

  it('calls navigate(-1) when "Go back" is clicked on the not-found screen', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /go back/i }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  // ─── Profile display ───────────────────────────────────────────────────────

  it('renders the student name and headline', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText('CS student at NYU')).toBeInTheDocument()
  })

  it('renders the location', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByText('New York, NY')).toBeInTheDocument()
  })

  it('renders the About section', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByText('Passionate about tech and building things.')).toBeInTheDocument()
  })

  it('does not render About section when about is empty', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...STUDENT_PROFILE, about: '' }) })
    renderPage()
    await screen.findByText('Alice Johnson')
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  // ─── Education section ─────────────────────────────────────────────────────

  it('renders the education section with university, major, and grad year', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByText('NYU')).toBeInTheDocument()
    expect(screen.getByText(/computer science/i)).toBeInTheDocument()
    expect(screen.getByText(/class of 2026/i)).toBeInTheDocument()
  })

  it('does not render the Education section when no education data is present', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ ...STUDENT_PROFILE, university: '', major: '', gradYear: '' }),
    })
    renderPage()
    await screen.findByText('Alice Johnson')
    expect(screen.queryByText('Education')).not.toBeInTheDocument()
  })

  // ─── Skills section ────────────────────────────────────────────────────────

  it('renders all skill tags', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByText('React')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
  })

  it('does not render the Skills section when skills array is empty', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...STUDENT_PROFILE, skills: [] }) })
    renderPage()
    await screen.findByText('Alice Johnson')
    expect(screen.queryByText('Skills')).not.toBeInTheDocument()
  })

  // ─── Links ─────────────────────────────────────────────────────────────────

  it('shows the Portfolio link when portfolioURL is set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    const link = await screen.findByRole('link', { name: /portfolio/i })
    expect(link).toHaveAttribute('href', 'https://github.com/alice')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('hides the Portfolio link when portfolioURL is not set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...STUDENT_PROFILE, portfolioURL: '' }) })
    renderPage()
    await screen.findByText('Alice Johnson')
    expect(screen.queryByRole('link', { name: /portfolio/i })).not.toBeInTheDocument()
  })

  it('shows the LinkedIn link when linkedinURL is set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    expect(await screen.findByRole('link', { name: /linkedin/i })).toHaveAttribute('href', 'https://linkedin.com/in/alice')
  })

  it('hides the LinkedIn link when linkedinURL is not set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...STUDENT_PROFILE, linkedinURL: '' }) })
    renderPage()
    await screen.findByText('Alice Johnson')
    expect(screen.queryByRole('link', { name: /linkedin/i })).not.toBeInTheDocument()
  })

  // ─── Own-profile actions ───────────────────────────────────────────────────

  it('shows an Edit Profile link when the viewer is viewing their own profile', async () => {
    authAs('stu-1') // viewer uid matches the route uid
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1')
    expect(await screen.findByRole('link', { name: /edit profile/i })).toHaveAttribute('href', '/profile')
  })

  it('hides the Edit Profile link when viewing another user\'s profile', async () => {
    authAs('viewer-99') // different from route uid 'stu-1'
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    expect(screen.queryByRole('link', { name: /edit profile/i })).not.toBeInTheDocument()
  })

  // ─── Back navigation ───────────────────────────────────────────────────────

  it('calls navigate(-1) when the Back button is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  // ─── Report feature ────────────────────────────────────────────────────────

  it('shows a Report button when viewing another user\'s profile', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1') // viewer-1 != stu-1
    await screen.findByText('Alice Johnson')
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })

  it('does not show a Report button on the viewer\'s own profile', async () => {
    authAs('stu-1') // own profile
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument()
  })

  it('opens the ReportModal when the Report button is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(await screen.findByText(/why are you reporting alice johnson/i)).toBeInTheDocument()
  })

  it('closes the ReportModal when Cancel is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => STUDENT_PROFILE })
    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    await screen.findByText(/why are you reporting alice johnson/i)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })

  it('writes a report document and a pass-swipe to Firestore on submission', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => STUDENT_PROFILE }) // profile load
      .mockResolvedValueOnce({ exists: () => false }) // report check: not yet reported
    setDoc.mockResolvedValue(undefined)

    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Harassment' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reporterId: 'viewer-1', reportedId: 'stu-1', reason: 'Harassment' }),
      )
    })
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: 'viewer-1', to: 'stu-1', direction: 'pass' }),
    )
  })

  it('shows a "Profile reported" toast after a successful first-time report', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => STUDENT_PROFILE })
      .mockResolvedValueOnce({ exists: () => false })
    setDoc.mockResolvedValue(undefined)

    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Inappropriate content' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    expect(await screen.findByRole('status')).toHaveTextContent('Profile reported')
  })

  it('shows "Already reported" toast and skips Firestore writes on a duplicate report', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => STUDENT_PROFILE })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ reporterId: 'viewer-1', reportedId: 'stu-1' }) })
    setDoc.mockResolvedValue(undefined)

    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    expect(await screen.findByRole('status')).toHaveTextContent('Already reported')
    expect(setDoc).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reporterId: 'viewer-1' }),
    )
  })

  it('closes the ReportModal after submission', async () => {
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => STUDENT_PROFILE })
      .mockResolvedValueOnce({ exists: () => false })
    setDoc.mockResolvedValue(undefined)

    renderPage('stu-1')
    await screen.findByText('Alice Johnson')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Misleading information' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })
})
