/**
 * System tests — verify that App's route table wires pages to URLs correctly
 * and that the root redirect lands on the right page.
 *
 * Strategy: mock BrowserRouter with MemoryRouter so tests can control the
 * initial URL without needing a real browser history API.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, getDocs, onSnapshot } from 'firebase/firestore'
import App from './App'

// ─── Firebase mocks ─────────────────────────────────────────────────────────

vi.mock('./firebase', () => ({ auth: {}, db: {}, storage: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(() => Promise.resolve('')),
}))

// ─── BrowserRouter → MemoryRouter swap ──────────────────────────────────────
// App.jsx imports BrowserRouter directly, so we replace it with MemoryRouter
// and let each test set the desired initial path via `testInitialPath`.

let testInitialPath = '/'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    BrowserRouter: ({ children }) =>
      React.createElement(actual.MemoryRouter, { initialEntries: [testInitialPath] }, children),
  }
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderApp(path = '/') {
  testInitialPath = path
  return render(<App />)
}

// Stub auth as unauthenticated (most pages redirect to /login; we use this
// to trigger that redirect and confirm the page component loaded).
function mockUnauthenticated() {
  onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
}

function mockAuthenticated(role = 'student') {
  onAuthStateChanged.mockImplementation((_auth, cb) => {
    cb({ uid: 'u1', displayName: 'Alice' })
    return vi.fn()
  })
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role, displayName: 'Alice' }) })
  getDocs.mockResolvedValue({ docs: [] })
  onSnapshot.mockReturnValue(() => {})
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  testInitialPath = '/'
})

// ─── Root redirect ────────────────────────────────────────────────────────────

describe('Root redirect', () => {
  it('redirects / to /signup and renders the signup form', async () => {
    renderApp('/')
    expect(await screen.findByRole('button', { name: /create account/i })).toBeInTheDocument()
  })
})

// ─── Public routes ─────────────────────────────────────────────────────────

describe('Public routes', () => {
  it('/signup renders the SignupPage form', async () => {
    renderApp('/signup')
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('/login renders the LoginPage form', async () => {
    renderApp('/login')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })
})

// ─── Protected routes — unauthenticated guard ─────────────────────────────

describe('Protected routes redirect to /login when unauthenticated', () => {
  const protectedPaths = ['/home', '/profile', '/swipe', '/messages', '/opportunities']

  for (const path of protectedPaths) {
    it(`${path} shows the login form for an unauthenticated visitor`, async () => {
      mockUnauthenticated()
      renderApp(path)
      // After the auth redirect, the router replaces the current location with
      // /login via navigate('/login'). The page renders the login form.
      expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument()
    })
  }
})

// ─── Authenticated routes ─────────────────────────────────────────────────

describe('Authenticated routes render the correct page', () => {
  it('/home shows the SwipeIn dashboard for a student', async () => {
    mockAuthenticated('student')
    renderApp('/home')
    expect(await screen.findByText('SwipeIn dashboard')).toBeInTheDocument()
  })

  it('/home shows the SwipeIn dashboard for a professional', async () => {
    mockAuthenticated('professional')
    renderApp('/home')
    expect(await screen.findByText('SwipeIn dashboard')).toBeInTheDocument()
  })

  it('/profile shows the "Set up your profile" form', async () => {
    mockAuthenticated('student')
    renderApp('/profile')
    expect(await screen.findByRole('button', { name: /complete profile/i })).toBeInTheDocument()
  })

  it('/swipe shows the loading indicator while fetching profiles', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => {
      cb({ uid: 'u1' })
      return vi.fn()
    })
    // getDoc resolves slowly (never in this case) so we catch the loading state
    getDoc.mockReturnValue(new Promise(() => {}))
    renderApp('/swipe')
    expect(await screen.findByText(/finding matches/i)).toBeInTheDocument()
  })

  it('/messages shows the loading state while conversations load', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => {
      cb({ uid: 'u1' })
      return vi.fn()
    })
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'student', displayName: 'Alice' }) })
    getDocs.mockReturnValue(new Promise(() => {})) // never resolves — keep loading
    renderApp('/messages')
    expect(await screen.findByText(/loading your conversations/i)).toBeInTheDocument()
  })

  it('/messages shows empty state when the user has no matches', async () => {
    mockAuthenticated('student')
    onSnapshot.mockReturnValue(() => {})
    renderApp('/messages')
    expect(await screen.findByText('No conversations yet')).toBeInTheDocument()
  })

  it('/opportunities redirects a student to /home', async () => {
    mockAuthenticated('student') // student → should be redirected to /home
    renderApp('/opportunities')
    // The OpportunitiesPage redirects non-professionals to /home.
    // After that redirect, HomePage loads.
    expect(await screen.findByText('SwipeIn dashboard')).toBeInTheDocument()
  })

  it('/opportunities shows the Opportunities page for a professional', async () => {
    mockAuthenticated('professional')
    renderApp('/opportunities')
    expect(await screen.findByRole('heading', { name: /^opportunities$/i })).toBeInTheDocument()
  })
})

// ─── Parameterised routes ─────────────────────────────────────────────────

describe('Parameterised profile routes', () => {
  it('/student/:uid shows the student profile for an authenticated user', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'viewer-1' }); return vi.fn() })
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'student',
        displayName: 'Alice Johnson',
        bio: 'CS student',
        skills: [],
      }),
    })
    renderApp('/student/stu-1')
    expect(await screen.findByText('Alice Johnson')).toBeInTheDocument()
  })

  it('/student/:uid shows "Profile not found" for a uid that does not exist', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'viewer-1' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    renderApp('/student/ghost-uid')
    expect(await screen.findByText('Profile not found')).toBeInTheDocument()
  })

  it('/professional/:uid shows the professional profile for an authenticated user', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'viewer-1' }); return vi.fn() })
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        role: 'professional',
        displayName: 'Bob Smith',
        company: 'Acme Corp',
        industry: 'technology',
      }),
    })
    renderApp('/professional/pro-1')
    expect(await screen.findByText('Bob Smith')).toBeInTheDocument()
  })

  it('/professional/:uid shows "Profile not found" for a uid that does not exist', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'viewer-1' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })
    renderApp('/professional/ghost-uid')
    expect(await screen.findByText('Profile not found')).toBeInTheDocument()
  })
})
