import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onAuthStateChanged } from 'firebase/auth'
import { getDoc, getDocs, addDoc, setDoc, onSnapshot } from 'firebase/firestore'
import MessagesPage from './MessagesPage'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(),
  limit: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

const CURRENT_USER = { uid: 'u1', displayName: 'Alice', role: 'student' }
const PARTNER = { displayName: 'Bob', role: 'professional' }

const MATCH_DOC = { id: 'match-1', data: () => ({ users: ['u1', 'u2'] }) }

function renderPage() {
  return render(
    <MemoryRouter>
      <MessagesPage />
    </MemoryRouter>,
  )
}

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    onSnapshot.mockReturnValue(() => {})
  })

  // ─── Auth guard ────────────────────────────────────────────────────────────

  it('redirects to /login when no user is authenticated', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb(null); return vi.fn() })
    renderPage()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
  })

  it('shows loading state while conversations are being fetched', () => {
    onAuthStateChanged.mockImplementation(() => vi.fn()) // never fires
    renderPage()
    expect(screen.getByText(/loading your conversations/i)).toBeInTheDocument()
  })

  it('unsubscribes from auth listener on unmount', () => {
    const mockUnsub = vi.fn()
    onAuthStateChanged.mockReturnValue(mockUnsub)
    const { unmount } = renderPage()
    unmount()
    expect(mockUnsub).toHaveBeenCalled()
  })

  // ─── Empty state ───────────────────────────────────────────────────────────

  it('shows empty state with swiping CTA when user has no matches', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => CURRENT_USER })
    getDocs.mockResolvedValue({ docs: [] })

    renderPage()

    expect(await screen.findByText('No conversations yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /start swiping/i })).toHaveAttribute('href', '/swipe')
  })

  it('has a Back link to /home', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc.mockResolvedValue({ exists: () => true, data: () => CURRENT_USER })
    getDocs.mockResolvedValue({ docs: [] })

    renderPage()

    expect(await screen.findByRole('link', { name: /^back$/i })).toHaveAttribute('href', '/home')
  })

  // ─── Conversation list ─────────────────────────────────────────────────────

  it('renders a conversation row for each match', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] }) // latest message query

    renderPage()

    expect(await screen.findByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Recruiter')).toBeInTheDocument()
  })

  it('labels a student partner as "Student"', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ displayName: 'Carol', role: 'student' }) })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })

    renderPage()

    expect(await screen.findByText('Student')).toBeInTheDocument()
  })

  it('uses "Your match" when partner display name is missing', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ role: 'professional' }) })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })

    renderPage()

    expect(await screen.findByText('Your match')).toBeInTheDocument()
  })

  it('shows default preview text when no messages exist for a match', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })

    renderPage()

    expect(await screen.findByText('Say hello and introduce yourself.')).toBeInTheDocument()
  })

  // ─── Thread view ───────────────────────────────────────────────────────────

  it('shows "Select a conversation" prompt when no conversation is active', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })

    renderPage()

    await screen.findByText('Bob')
    expect(screen.getByText('Select a conversation')).toBeInTheDocument()
  })

  it('shows empty chat prompt when a conversation is opened with no messages', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    // loadConversations runs twice: once on mount, once when activeConversationId changes
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER }) // auth effect
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })      // initial load partner
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })      // reload partner after click
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // matches (initial)
      .mockResolvedValueOnce({ docs: [] })           // latest msg (initial)
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // matches (reload after click)
      .mockResolvedValueOnce({ docs: [] })           // latest msg (reload)
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))

    expect(await screen.findByText('Start with a friendly intro')).toBeInTheDocument()
  })

  it('renders messages from Firestore in an open conversation', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => {
      onNext({
        docs: [{ id: 'msg-1', data: () => ({ text: 'Hello there!', senderId: 'u2', senderName: 'Bob', createdAt: null }) }],
      })
      return () => {}
    })

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))

    expect(await screen.findByText('Hello there!')).toBeInTheDocument()
  })

  it('cleans up the message snapshot listener when a conversation is deselected', async () => {
    const unsubMessages = vi.fn()
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return unsubMessages })

    const { unmount } = renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    unmount()

    expect(unsubMessages).toHaveBeenCalled()
  })

  // ─── Send message ──────────────────────────────────────────────────────────

  it('calls addDoc with the correct message payload when Send is clicked', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // initial load
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // refreshConversations after send
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // refreshConversations after send
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })
    addDoc.mockResolvedValue({ id: 'new-msg' })
    setDoc.mockResolvedValue(undefined)

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    await screen.findByPlaceholderText('Send a message')

    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'Hi Bob!' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(addDoc).toHaveBeenCalledOnce())
    const [, payload] = addDoc.mock.calls[0]
    expect(payload.text).toBe('Hi Bob!')
    expect(payload.senderId).toBe('u1')
    expect(payload.senderName).toBe('Alice')
  })

  it('also calls setDoc to update the match document with the last message', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // refreshConversations after send
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // refreshConversations after send
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })
    addDoc.mockResolvedValue({ id: 'new-msg' })
    setDoc.mockResolvedValue(undefined)

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    await screen.findByPlaceholderText('Send a message')

    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'Hey!' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(setDoc).toHaveBeenCalled())
    const [, payload] = setDoc.mock.calls[0]
    expect(payload.lastMessage).toBe('Hey!')
    expect(payload.lastMessageBy).toBe('u1')
  })

  it('does not call addDoc when the draft is blank', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    await screen.findByPlaceholderText('Send a message')

    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(addDoc).not.toHaveBeenCalled()
  })

  it('shows a local storage notice when the message send fails', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })
    addDoc.mockRejectedValue(new Error('Network error'))

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    await screen.findByPlaceholderText('Send a message')

    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'Test message' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText(/saved locally/i)).toBeInTheDocument()
  })

  it('saves the optimistic message to localStorage before addDoc resolves', async () => {
    onAuthStateChanged.mockImplementation((_auth, cb) => { cb({ uid: 'u1' }); return vi.fn() })
    getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => CURRENT_USER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER })
      .mockResolvedValueOnce({ exists: () => true, data: () => PARTNER }) // reload after click
    getDocs
      .mockResolvedValueOnce({ docs: [MATCH_DOC] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [MATCH_DOC] }) // reload after click
      .mockResolvedValueOnce({ docs: [] })
    onSnapshot.mockImplementation((_q, onNext) => { onNext({ docs: [] }); return () => {} })
    // Never resolves — lets us check localStorage before any async completion
    addDoc.mockReturnValue(new Promise(() => {}))

    renderPage()
    fireEvent.click(await screen.findByText('Bob'))
    await screen.findByPlaceholderText('Send a message')

    fireEvent.change(screen.getByPlaceholderText('Send a message'), { target: { value: 'Stored message' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      const stored = localStorage.getItem('swipein-messages:match-1')
      expect(stored).not.toBeNull()
      expect(JSON.parse(stored).some((m) => m.text === 'Stored message')).toBe(true)
    })
  })
})
