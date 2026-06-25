import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import OpportunitiesPage from './OpportunitiesPage'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PRO_PROFILE = {
  uid: 'pro-1',
  displayName: 'Bob Smith',
  role: 'professional',
  company: 'Acme Corp',
  jobTitle: 'CTO',
  photoURL: '',
}

function makeOpp(id, overrides = {}) {
  return {
    id,
    data: () => ({
      title: `Opportunity ${id}`,
      type: 'internship',
      description: 'A great opportunity for students.',
      location: 'New York, NY',
      industry: 'technology',
      skills: ['React', 'Python'],
      isPaid: true,
      duration: '10 weeks',
      deadline: '2026-08-01',
      professionalId: 'pro-1',
      ...overrides,
    }),
  }
}

function makeApp(id, overrides = {}) {
  return {
    id,
    data: () => ({
      opportunityId: 'opp-1',
      studentId: 'stu-1',
      studentName: 'Alice Johnson',
      studentUniversity: 'NYU',
      studentMajor: 'Computer Science',
      studentGradYear: '2026',
      studentSkills: ['Python', 'Django'],
      studentBio: 'Passionate about building products.',
      message: 'I would love to join your team.',
      status: 'pending',
      ...overrides,
    }),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const renderPage = () =>
  render(
    <MemoryRouter>
      <OpportunitiesPage />
    </MemoryRouter>
  )

async function renderWithOpps(opps = [makeOpp('opp-1')]) {
  getDocs.mockResolvedValue({ docs: opps })
  renderPage()
  await waitFor(() => screen.getByText(opps[0].data().title))
}

async function openNewForm() {
  await waitFor(() => screen.getByRole('button', { name: /\+ post opportunity/i }))
  fireEvent.click(screen.getByRole('button', { name: /\+ post opportunity/i }))
  await waitFor(() => screen.getByRole('heading', { name: /new opportunity/i }))
}

function fillRequiredFields({ title = 'Summer Software Intern', description = 'Join our engineering team for 10 weeks.' } = {}) {
  fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: title } })
  fireEvent.change(screen.getByLabelText(/^description/i), { target: { value: description } })
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    cb({ uid: 'pro-1' })
    return vi.fn()
  })
  getDoc.mockResolvedValue({ exists: () => true, data: () => PRO_PROFILE })
  getDocs.mockResolvedValue({ docs: [] })
  addDoc.mockResolvedValue({ id: 'new-opp-id' })
  updateDoc.mockResolvedValue(undefined)
  deleteDoc.mockResolvedValue(undefined)
})

// ─── Auth & role guard ────────────────────────────────────────────────────────

describe('Auth & role guard', () => {
  it('redirects to /login when unauthenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('redirects to /home when the authenticated user is not a professional', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student' }) })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home'))
  })

  it('redirects to /home when the user document does not exist', async () => {
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/home'))
  })

  it('renders the page for an authenticated professional', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Opportunities')
    )
  })
})

// ─── My opportunities tab ─────────────────────────────────────────────────────

describe('My opportunities tab', () => {
  it('shows the empty state when no opportunities have been posted', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('No opportunities posted yet')).toBeInTheDocument()
    )
  })

  it('renders an opportunity row for each posted opportunity', async () => {
    await renderWithOpps([makeOpp('opp-1', { title: 'UX Design Intern' })])
    expect(screen.getByText('UX Design Intern')).toBeInTheDocument()
  })

  it('shows the type badge for each opportunity', async () => {
    await renderWithOpps([makeOpp('opp-1', { type: 'mentorship', title: 'Design Mentorship' })])
    expect(screen.getByText('mentorship')).toBeInTheDocument()
  })

  it('shows a tab badge with the opportunity count', async () => {
    await renderWithOpps([makeOpp('opp-1'), makeOpp('opp-2')])
    expect(screen.getByText('2')).toBeInTheDocument()
  })
})

// ─── Create opportunity ───────────────────────────────────────────────────────

describe('Create opportunity', () => {
  it('opens the "New opportunity" form when the post button is clicked', async () => {
    renderPage()
    await openNewForm()
    expect(screen.getByRole('heading', { name: /new opportunity/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^post opportunity$/i })).toBeInTheDocument()
  })

  it('closes the form when the Cancel button is clicked', async () => {
    renderPage()
    await openNewForm()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /new opportunity/i })).not.toBeInTheDocument()
    )
  })

  it('shows a validation error when title is empty', async () => {
    renderPage()
    await openNewForm()
    fireEvent.click(screen.getByRole('button', { name: /^post opportunity$/i }))
    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('shows a validation error when description is empty', async () => {
    renderPage()
    await openNewForm()
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'My Internship' } })
    fireEvent.click(screen.getByRole('button', { name: /^post opportunity$/i }))
    expect(await screen.findByText('Description is required')).toBeInTheDocument()
    expect(addDoc).not.toHaveBeenCalled()
  })

  it('calls addDoc with the correct fields on valid submission', async () => {
    renderPage()
    await openNewForm()
    fillRequiredFields()
    fireEvent.change(screen.getByLabelText(/location/i), { target: { value: 'Remote' } })
    fireEvent.click(screen.getByRole('button', { name: /^post opportunity$/i }))

    await waitFor(() => expect(addDoc).toHaveBeenCalledOnce())
    const [, payload] = addDoc.mock.calls[0]
    expect(payload.title).toBe('Summer Software Intern')
    expect(payload.description).toBe('Join our engineering team for 10 weeks.')
    expect(payload.location).toBe('Remote')
    expect(payload.professionalId).toBe('pro-1')
  })

  it('closes the form and adds the new opportunity to the list on success', async () => {
    renderPage()
    await openNewForm()
    fillRequiredFields({ title: 'Backend Engineer Intern' })
    fireEvent.click(screen.getByRole('button', { name: /^post opportunity$/i }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /new opportunity/i })).not.toBeInTheDocument()
    )
    expect(screen.getByText('Backend Engineer Intern')).toBeInTheDocument()
  })

  it('shows a save error message when addDoc rejects', async () => {
    addDoc.mockRejectedValue(new Error('Quota exceeded'))
    renderPage()
    await openNewForm()
    fillRequiredFields()
    fireEvent.click(screen.getByRole('button', { name: /^post opportunity$/i }))
    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument()
  })

  it('hides the Paid internship checkbox when type is Mentorship', async () => {
    renderPage()
    await openNewForm()
    expect(screen.getByLabelText(/paid internship/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^type/i), { target: { value: 'mentorship' } })
    expect(screen.queryByLabelText(/paid internship/i)).not.toBeInTheDocument()
  })
})

// ─── Edit opportunity ─────────────────────────────────────────────────────────

describe('Edit opportunity', () => {
  it('opens the edit form pre-filled with the opportunity data', async () => {
    await renderWithOpps([makeOpp('opp-1', { title: 'Old Title', description: 'Old description.' })])
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /edit opportunity/i })).toBeInTheDocument()
    )
    expect(screen.getByLabelText(/^title/i)).toHaveValue('Old Title')
    expect(screen.getByLabelText(/^description/i)).toHaveValue('Old description.')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('calls updateDoc with the changed data on save', async () => {
    await renderWithOpps([makeOpp('opp-1', { title: 'Old Title', description: 'Old desc.' })])
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    await waitFor(() => screen.getByLabelText(/^title/i))
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'Updated Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateDoc).toHaveBeenCalledOnce())
    const [, payload] = updateDoc.mock.calls[0]
    expect(payload.title).toBe('Updated Title')
  })

  it('closes the form and reflects the updated title in the list', async () => {
    await renderWithOpps([makeOpp('opp-1', { title: 'Old Title', description: 'Old desc.' })])
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))

    await waitFor(() => screen.getByLabelText(/^title/i))
    fireEvent.change(screen.getByLabelText(/^title/i), { target: { value: 'New Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /edit opportunity/i })).not.toBeInTheDocument()
    )
    expect(screen.getByText('New Title')).toBeInTheDocument()
  })
})

// ─── Delete opportunity ───────────────────────────────────────────────────────

describe('Delete opportunity', () => {
  it('calls deleteDoc and removes the opportunity when deletion is confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderWithOpps([makeOpp('opp-1', { title: 'Doomed Opportunity' })])

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledOnce()
      expect(screen.queryByText('Doomed Opportunity')).not.toBeInTheDocument()
    })
    expect(screen.getByText('No opportunities posted yet')).toBeInTheDocument()
  })

  it('does not call deleteDoc when the confirm dialog is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await renderWithOpps([makeOpp('opp-1', { title: 'Safe Opportunity' })])

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(deleteDoc).not.toHaveBeenCalled()
    expect(screen.getByText('Safe Opportunity')).toBeInTheDocument()
  })
})

// ─── Skills tag input ─────────────────────────────────────────────────────────

describe('Skills tag input', () => {
  it('adds a skill tag when Enter is pressed', async () => {
    renderPage()
    await openNewForm()

    const input = screen.getByPlaceholderText(/react, python/i)
    fireEvent.change(input, { target: { value: 'GraphQL' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('GraphQL')).toBeInTheDocument()
  })

  it('adds a skill tag when a comma is pressed', async () => {
    renderPage()
    await openNewForm()

    const input = screen.getByPlaceholderText(/react, python/i)
    fireEvent.change(input, { target: { value: 'TypeScript' } })
    fireEvent.keyDown(input, { key: ',' })

    expect(screen.getByText('TypeScript')).toBeInTheDocument()
  })

  it('does not add a duplicate skill', async () => {
    renderPage()
    await openNewForm()

    const input = screen.getByPlaceholderText(/react, python/i)
    fireEvent.change(input, { target: { value: 'Node.js' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'Node.js' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getAllByText('Node.js')).toHaveLength(1)
  })

  it('removes a skill when its × button is clicked', async () => {
    renderPage()
    await openNewForm()

    const input = screen.getByPlaceholderText(/react, python/i)
    fireEvent.change(input, { target: { value: 'Docker' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('Docker')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /remove docker/i }))
    expect(screen.queryByText('Docker')).not.toBeInTheDocument()
  })
})

// ─── Applications tab ─────────────────────────────────────────────────────────

describe('Applications tab', () => {
  async function renderWithApps(apps = [makeApp('app-1')]) {
    getDocs
      .mockResolvedValueOnce({ docs: [makeOpp('opp-1', { title: 'Summer Intern' })] })
      .mockResolvedValueOnce({ docs: apps })
    renderPage()
    await waitFor(() => screen.getByText('Summer Intern'))
    fireEvent.click(screen.getByRole('button', { name: /^applications/i }))
    await waitFor(() => screen.getByText(/no applications yet|alice johnson/i))
  }

  it('shows the empty state when there are no applications', async () => {
    await renderWithApps([])
    expect(screen.getByText('No applications yet')).toBeInTheDocument()
  })

  it('displays the applicant name and university', async () => {
    await renderWithApps()
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.getByText(/NYU/)).toBeInTheDocument()
  })

  it('shows the pending status pill', async () => {
    await renderWithApps([makeApp('app-1', { status: 'pending' })])
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('shows Accept and Reject buttons for a pending application', async () => {
    await renderWithApps([makeApp('app-1', { status: 'pending' })])
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
  })

  it('calls updateDoc with status "accepted" when Accept is clicked', async () => {
    await renderWithApps([makeApp('app-1', { status: 'pending' })])
    fireEvent.click(screen.getByRole('button', { name: /accept/i }))
    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'accepted' })
    )
  })

  it('calls updateDoc with status "rejected" when Reject is clicked', async () => {
    await renderWithApps([makeApp('app-1', { status: 'pending' })])
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))
    await waitFor(() =>
      expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { status: 'rejected' })
    )
  })

  it('shows an Undo button (not Accept/Reject) for an accepted application', async () => {
    await renderWithApps([makeApp('app-1', { status: 'accepted' })])
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument()
  })

  it('shows a Reconsider button for a rejected application', async () => {
    await renderWithApps([makeApp('app-1', { status: 'rejected' })])
    expect(screen.getByRole('button', { name: /reconsider/i })).toBeInTheDocument()
  })

  it('shows the applicant cover note when present', async () => {
    await renderWithApps([makeApp('app-1', { message: 'I am the best candidate.' })])
    expect(screen.getByText('I am the best candidate.')).toBeInTheDocument()
  })

  it('links View Profile to the student profile page', async () => {
    await renderWithApps([makeApp('app-1', { studentId: 'stu-42' })])
    expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/student/stu-42')
  })

  it('filters applications to only show the selected status', async () => {
    await renderWithApps([
      makeApp('app-1', { studentName: 'Alice Johnson', status: 'pending' }),
      makeApp('app-2', { studentName: 'Bob Carter', status: 'accepted' }),
    ])
    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
      expect(screen.getByText('Bob Carter')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/^status/i), { target: { value: 'pending' } })

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    expect(screen.queryByText('Bob Carter')).not.toBeInTheDocument()
  })

  it('shows the application count badge on the Applications tab after loading', async () => {
    await renderWithApps([makeApp('app-1'), makeApp('app-2')])
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
  })
})
