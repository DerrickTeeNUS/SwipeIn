import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { setDoc } from 'firebase/firestore'
import SignupPage from './SignupPage'

vi.mock('../firebase', () => ({ auth: {}, db: {} }))

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'timestamp'),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupPage />
    </MemoryRouter>,
  )
}

function fillForm({ fullName = 'Jane Doe', email = 'jane@example.com', role = 'student', password = 'pass123', confirmPassword = 'pass123' } = {}) {
  if (fullName !== null) fireEvent.change(screen.getByLabelText('Full name'), { target: { value: fullName } })
  if (email !== null) fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } })
  if (role !== null) fireEvent.change(screen.getByLabelText('Role'), { target: { value: role } })
  if (password !== null) fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  if (confirmPassword !== null) fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmPassword } })
}

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all form fields and submit button', () => {
    renderSignup()
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Role')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  describe('validate()', () => {
    it('shows an error when full name is empty', async () => {
      renderSignup()
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Full name is required')).toBeInTheDocument()
    })

    it('shows an error when email format is invalid', async () => {
      renderSignup()
      fillForm({ email: 'notanemail' })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    })

    it('shows an error when no role is selected', async () => {
      renderSignup()
      fillForm({ role: null })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Please select a role')).toBeInTheDocument()
    })

    it('shows an error when password is fewer than 6 characters', async () => {
      renderSignup()
      fillForm({ password: 'abc', confirmPassword: 'abc' })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument()
    })

    it('shows an error when passwords do not match', async () => {
      renderSignup()
      fillForm({ password: 'pass123', confirmPassword: 'different' })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    })

    it('clears a field error as soon as the user starts typing in that field', async () => {
      renderSignup()
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      expect(await screen.findByText('Full name is required')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'J' } })
      expect(screen.queryByText('Full name is required')).not.toBeInTheDocument()
    })

    it('does not submit and does not call Firebase when validation fails', async () => {
      renderSignup()
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
      await screen.findByText('Full name is required')
      expect(createUserWithEmailAndPassword).not.toHaveBeenCalled()
    })
  })

  it('toggles the password field between hidden and visible', () => {
    renderSignup()
    const passwordInput = screen.getByLabelText('Password')
    expect(passwordInput).toHaveAttribute('type', 'password')

    const toggleBtns = screen.getAllByLabelText('Show password')
    fireEvent.click(toggleBtns[0])
    expect(passwordInput).toHaveAttribute('type', 'text')

    fireEvent.click(screen.getAllByLabelText('Hide password')[0])
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('calls createUserWithEmailAndPassword with email and password on valid submission', async () => {
    createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'uid-1' } })
    updateProfile.mockResolvedValueOnce()
    setDoc.mockResolvedValueOnce()

    renderSignup()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({}, 'jane@example.com', 'pass123')
    })
  })

  it('navigates to /profile after successful account creation', async () => {
    createUserWithEmailAndPassword.mockResolvedValueOnce({ user: { uid: 'uid-1' } })
    updateProfile.mockResolvedValueOnce()
    setDoc.mockResolvedValueOnce()

    renderSignup()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/profile')
    })
  })

  it('displays a Firebase error when account creation fails', async () => {
    createUserWithEmailAndPassword.mockRejectedValueOnce(new Error('Email already in use'))

    renderSignup()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('Email already in use')).toBeInTheDocument()
  })
})
