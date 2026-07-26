import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, setDoc } from 'firebase/firestore'
import ProfessionalProfilePage from './ProfessionalProfilePage'

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

function renderPage(uid = 'pro-1') {
  return render(
    <MemoryRouter initialEntries={[`/professional/${uid}`]}>
      <Routes>
        <Route path="/professional/:uid" element={<ProfessionalProfilePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function authAs(uid) {
  onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid }); return vi.fn() })
}

const PROFESSIONAL_PROFILE = {
  role: 'professional',
  displayName: 'Bob Smith',
  bio: 'Senior Engineer at Acme · Hiring talent',
  company: 'Acme Corp',
  jobTitle: 'Senior Engineer',
  industry: 'technology',
  location: 'San Francisco, CA',
  about: 'I love building scalable systems.',
  lookingFor: 'Someone eager to learn and take ownership.',
  linkedinURL: 'https://linkedin.com/in/bobsmith',
}

describe('ProfessionalProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authAs('viewer-1')
  })

  // ─── Auth guard ────────────────────────────────────────────────────────────

  it('redirects to /login when unauthenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('unsubscribes from auth listener on unmount', () => {
    const mockUnsub = vi.fn()
    onAuthStateChanged.mockReturnValue(mockUnsub)
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
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

  it('shows "Profile not found" when the uid belongs to a student', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student', displayName: 'Alice' }) })
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

  it('renders the professional name and headline', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('Bob Smith')).toBeInTheDocument()
    expect(screen.getByText('Senior Engineer at Acme · Hiring talent')).toBeInTheDocument()
  })

  it('renders the workplace line combining job title and company', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('Senior Engineer at Acme Corp')).toBeInTheDocument()
  })

  it('renders only the job title when company is absent', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, company: '' }) })
    renderPage()
    expect(await screen.findByText('Senior Engineer')).toBeInTheDocument()
  })

  it('renders the location', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('San Francisco, CA')).toBeInTheDocument()
  })

  // ─── About section ─────────────────────────────────────────────────────────

  it('renders the About section', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('I love building scalable systems.')).toBeInTheDocument()
  })

  it('does not render the About section when about is empty', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, about: '' }) })
    renderPage()
    await screen.findByText('Bob Smith')
    expect(screen.queryByText('About')).not.toBeInTheDocument()
  })

  // ─── Company section ───────────────────────────────────────────────────────

  it('renders the Company section with the company name', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('Acme Corp')).toBeInTheDocument()
  })

  it('maps the industry key to a human-readable label', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    await screen.findByText('Acme Corp')
    expect(screen.getByText(/technology/i)).toBeInTheDocument()
  })

  it.each([
    ['finance', 'Finance'],
    ['healthcare', 'Healthcare'],
    ['consulting', 'Consulting'],
    ['media', 'Media & Entertainment'],
    ['retail', 'Retail & E-commerce'],
    ['education', 'Education'],
    ['government', 'Government & Nonprofit'],
    ['other', 'Other'],
  ])('maps industry key "%s" to label "%s"', async (key, label) => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, industry: key }) })
    renderPage()
    // The label appears combined with the job title ("Senior Engineer · Finance"),
    // so use { exact: false } to do a substring match.
    expect(await screen.findByText(label, { exact: false })).toBeInTheDocument()
  })

  it('does not render the Company section when both company and industry are absent', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, company: '', industry: '' }) })
    renderPage()
    await screen.findByText('Bob Smith')
    expect(screen.queryByText('Company')).not.toBeInTheDocument()
  })

  // ─── Looking for section ───────────────────────────────────────────────────

  it('renders the "Looking for" section', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    expect(await screen.findByText('Someone eager to learn and take ownership.')).toBeInTheDocument()
  })

  it('does not render the "Looking for" section when lookingFor is empty', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, lookingFor: '' }) })
    renderPage()
    await screen.findByText('Bob Smith')
    expect(screen.queryByText('Looking for in an intern')).not.toBeInTheDocument()
  })

  // ─── Links ─────────────────────────────────────────────────────────────────

  it('shows the LinkedIn link when linkedinURL is set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    const link = await screen.findByRole('link', { name: /linkedin/i })
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/bobsmith')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('hides the LinkedIn link when linkedinURL is not set', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...PROFESSIONAL_PROFILE, linkedinURL: '' }) })
    renderPage()
    await screen.findByText('Bob Smith')
    expect(screen.queryByRole('link', { name: /linkedin/i })).not.toBeInTheDocument()
  })

  // ─── Own-profile actions ───────────────────────────────────────────────────

  it('shows an Edit Profile link when the viewer is viewing their own profile', async () => {
    authAs('pro-1') // viewer uid matches route uid
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1')
    expect(await screen.findByRole('link', { name: /edit profile/i })).toHaveAttribute('href', '/profile')
  })

  it('hides Edit Profile when viewing another user\'s profile', async () => {
    authAs('viewer-99') // different from route uid 'pro-1'
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    expect(screen.queryByRole('link', { name: /edit profile/i })).not.toBeInTheDocument()
  })

  // ─── Back navigation ───────────────────────────────────────────────────────

  it('calls navigate(-1) when the Back button is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /back/i }))
    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })

  // ─── Report feature ────────────────────────────────────────────────────────

  it('shows a Report button when viewing another user\'s profile', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1') // viewer-1 != pro-1
    await screen.findByText('Bob Smith')
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })

  it('does not show a Report button on the viewer\'s own profile', async () => {
    authAs('pro-1') // own profile
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    expect(screen.queryByRole('button', { name: /report/i })).not.toBeInTheDocument()
  })

  it('opens the ReportModal when the Report button is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(await screen.findByText(/why are you reporting bob smith/i)).toBeInTheDocument()
  })

  it('closes the ReportModal when Cancel is clicked', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    await screen.findByText(/why are you reporting bob smith/i)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })

  it('writes a report document and a pass-swipe to Firestore on submission', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    setDoc.mockResolvedValue(undefined)

    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Spam or fake profile' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reporterId: 'viewer-1', reportedId: 'pro-1', reason: 'Spam or fake profile' }),
      )
    })
    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: 'viewer-1', to: 'pro-1', direction: 'pass' }),
    )
  })

  it('shows a "Report submitted" toast after submitting', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    setDoc.mockResolvedValue(undefined)

    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Inappropriate content' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    expect(await screen.findByRole('status')).toHaveTextContent('Report submitted')
  })

  it('navigates back after submitting a report', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    setDoc.mockResolvedValue(undefined)

    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Inappropriate content' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(-1), { timeout: 2000 })
  })

  it('closes the ReportModal after submission', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => PROFESSIONAL_PROFILE })
    setDoc.mockResolvedValue(undefined)

    renderPage('pro-1')
    await screen.findByText('Bob Smith')
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Misleading information' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))

    await waitFor(() => {
      expect(screen.queryByText(/why are you reporting/i)).not.toBeInTheDocument()
    })
  })
})
