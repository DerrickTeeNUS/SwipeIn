import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, setDoc } from 'firebase/firestore'
import ProfilePage from './ProfilePage'

vi.mock('../firebase', () => ({ auth: {}, db: {}, storage: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(() => Promise.resolve('https://example.com/photo.jpg')),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  )
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Auth guard ────────────────────────────────────────────────────────────

  it('redirects to /login when unauthenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('shows a loading state while auth resolves', () => {
    onAuthStateChanged.mockImplementation(() => vi.fn()) // never fires
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('unsubscribes from auth listener on unmount', () => {
    const mockUnsub = vi.fn()
    onAuthStateChanged.mockReturnValue(mockUnsub)
    const { unmount } = renderPage()
    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })

  // ─── Form rendering ────────────────────────────────────────────────────────

  it('renders the profile form after auth resolves', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    renderPage()

    expect(await screen.findByRole('button', { name: /complete profile/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Headline')).toBeInTheDocument()
    expect(screen.getByLabelText('Location')).toBeInTheDocument()
    expect(screen.getByLabelText('About you')).toBeInTheDocument()
  })

  it('shows the user initials as avatar when no photo is set', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice Bob' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    renderPage()

    expect(await screen.findByText('AB')).toBeInTheDocument()
  })

  it('shows a "?" avatar when displayName is absent', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: null }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    renderPage()

    expect(await screen.findByText('?')).toBeInTheDocument()
  })

  // ─── Pre-population ────────────────────────────────────────────────────────

  it('populates form fields with existing profile data', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'student',
        bio: 'CS student at NYU',
        location: 'New York, NY',
        about: 'I love coding.',
        university: 'NYU',
        major: 'Computer Science',
        skills: ['React', 'Python'],
      }),
    })

    renderPage()

    expect(await screen.findByDisplayValue('CS student at NYU')).toBeInTheDocument()
    expect(screen.getByDisplayValue('New York, NY')).toBeInTheDocument()
    expect(screen.getByDisplayValue('I love coding.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('NYU')).toBeInTheDocument()
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('Python')).toBeInTheDocument()
  })

  // ─── Role-specific fields ──────────────────────────────────────────────────

  it('shows student-specific fields (university, major, grad year, skills) for student role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderPage()

    expect(await screen.findByLabelText('University')).toBeInTheDocument()
    expect(screen.getByLabelText('Major')).toBeInTheDocument()
    expect(screen.getByLabelText('Graduation year')).toBeInTheDocument()
  })

  it('does not show student fields for a professional role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Bob' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'professional' }) })

    renderPage()

    await screen.findByRole('button', { name: /complete profile/i })
    expect(screen.queryByLabelText('University')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Major')).not.toBeInTheDocument()
  })

  it('shows professional-specific fields (company, job title, industry, looking for) for professional role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Bob' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'professional' }) })

    renderPage()

    expect(await screen.findByLabelText('Company')).toBeInTheDocument()
    expect(screen.getByLabelText('Job title')).toBeInTheDocument()
    expect(screen.getByLabelText('Industry')).toBeInTheDocument()
    expect(screen.getByLabelText(/what are you looking for/i)).toBeInTheDocument()
  })

  it('does not show professional fields for a student role', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderPage()

    await screen.findByRole('button', { name: /complete profile/i })
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument()
  })

  // ─── Skills tag input ──────────────────────────────────────────────────────

  it('adds a skill tag when Enter is pressed in the skills input', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderPage()
    await screen.findByRole('button', { name: /complete profile/i })

    const input = screen.getByPlaceholderText(/react, python, figma/i)
    fireEvent.change(input, { target: { value: 'GraphQL' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('GraphQL')).toBeInTheDocument()
  })

  it('adds a skill tag when a comma is pressed', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })

    renderPage()
    await screen.findByRole('button', { name: /complete profile/i })

    const input = screen.getByPlaceholderText(/react, python, figma/i)
    fireEvent.change(input, { target: { value: 'TypeScript' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('does not add a duplicate skill', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student', skills: ['Node.js'] }) })

    renderPage()
    await screen.findByText('Node.js')

    const input = screen.getByRole('textbox', { name: '' })
    fireEvent.change(input, { target: { value: 'Node.js' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getAllByText('Node.js')).toHaveLength(1)
  })

  it('removes a skill tag when its × button is clicked', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student', skills: ['Docker'] }) })

    renderPage()
    await screen.findByText('Docker')

    fireEvent.click(screen.getByRole('button', { name: /remove docker/i }))
    expect(screen.queryByText('Docker')).not.toBeInTheDocument()
  })

  // ─── Form submission ───────────────────────────────────────────────────────

  it('calls setDoc with the form data and navigates to /home on success', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })
    setDoc.mockResolvedValue(undefined)

    renderPage()
    await screen.findByRole('button', { name: /complete profile/i })

    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'CS student at MIT' } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Boston, MA' } })
    fireEvent.click(screen.getByRole('button', { name: /complete profile/i }))

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledOnce()
      const [, payload] = setDoc.mock.calls[0]
      expect(payload.bio).toBe('CS student at MIT')
      expect(payload.location).toBe('Boston, MA')
      expect(payload.profileComplete).toBe(true)
      expect(mockNavigate).toHaveBeenCalledWith('/home')
    })
  })

  it('disables the submit button while saving', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })
    setDoc.mockReturnValue(new Promise(() => {})) // never resolves

    renderPage()
    await screen.findByRole('button', { name: /complete profile/i })
    fireEvent.click(screen.getByRole('button', { name: /complete profile/i }))

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled()
  })

  it('shows an error message when setDoc fails', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })
    setDoc.mockRejectedValue(new Error('Permission denied'))

    renderPage()
    await screen.findByRole('button', { name: /complete profile/i })
    fireEvent.click(screen.getByRole('button', { name: /complete profile/i }))

    expect(await screen.findByText(/failed to save profile/i)).toBeInTheDocument()
  })

  // ─── Skip button ───────────────────────────────────────────────────────────

  it('navigates to /home when "Skip for now" is clicked without submitting', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1', displayName: 'Alice' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    renderPage()
    await screen.findByRole('button', { name: /skip for now/i })
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/home')
    expect(setDoc).not.toHaveBeenCalled()
  })
})
