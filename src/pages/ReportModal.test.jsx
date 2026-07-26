import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import ReportModal from './ReportModal'

const REASONS = [
  'Inappropriate content',
  'Spam or fake profile',
  'Harassment',
  'Misleading information',
  'Other',
]

describe('ReportModal', () => {
  const onSubmit = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderModal(props = {}) {
    return render(
      <ReportModal
        reportedName="Alice Johnson"
        onSubmit={onSubmit}
        onClose={onClose}
        {...props}
      />,
    )
  }

  // ─── Content ───────────────────────────────────────────────────────────────

  it('shows the reported user name in the subtitle', () => {
    renderModal()
    expect(screen.getByText(/why are you reporting alice johnson/i)).toBeInTheDocument()
  })

  it('falls back to "this profile" when no name is provided', () => {
    renderModal({ reportedName: undefined })
    expect(screen.getByText(/why are you reporting this profile/i)).toBeInTheDocument()
  })

  it('renders all five selectable report reasons', () => {
    renderModal()
    for (const reason of REASONS) {
      expect(screen.getByRole('radio', { name: reason })).toBeInTheDocument()
    }
  })

  // ─── Submit button state ───────────────────────────────────────────────────

  it('disables the submit button before any reason is selected', () => {
    renderModal()
    expect(screen.getByRole('button', { name: /submit report/i })).toBeDisabled()
  })

  it('enables the submit button after a reason is selected', () => {
    renderModal()
    fireEvent.click(screen.getByRole('radio', { name: 'Harassment' }))
    expect(screen.getByRole('button', { name: /submit report/i })).not.toBeDisabled()
  })

  it('enables the submit button for each selectable reason', () => {
    for (const reason of REASONS) {
      const { unmount } = renderModal()
      fireEvent.click(screen.getByRole('radio', { name: reason }))
      expect(screen.getByRole('button', { name: /submit report/i })).not.toBeDisabled()
      unmount()
    }
  })

  // ─── Dismiss / cancel ──────────────────────────────────────────────────────

  it('calls onClose when the Cancel button is clicked', () => {
    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop overlay is clicked', () => {
    const { container } = renderModal()
    fireEvent.click(container.querySelector('.report-overlay'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when the modal panel itself is clicked', () => {
    const { container } = renderModal()
    fireEvent.click(container.querySelector('.report-modal'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // ─── Submission ────────────────────────────────────────────────────────────

  it('calls onSubmit with the selected reason on form submission', async () => {
    onSubmit.mockResolvedValue(undefined)
    renderModal()
    fireEvent.click(screen.getByRole('radio', { name: 'Spam or fake profile' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Spam or fake profile')
    })
  })

  it('passes the exact selected reason string to onSubmit', async () => {
    onSubmit.mockResolvedValue(undefined)
    for (const reason of REASONS) {
      vi.clearAllMocks()
      const { unmount } = renderModal()
      fireEvent.click(screen.getByRole('radio', { name: reason }))
      fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(reason))
      unmount()
    }
  })

  it('shows "Reporting…" on the submit button while the submission is pending', async () => {
    let resolve
    onSubmit.mockReturnValue(new Promise(r => { resolve = r }))
    renderModal()
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    expect(await screen.findByRole('button', { name: /reporting/i })).toBeInTheDocument()
    resolve()
  })

  it('disables the submit button while the submission is pending', async () => {
    let resolve
    onSubmit.mockReturnValue(new Promise(r => { resolve = r }))
    renderModal()
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: /submit report/i }))
    expect(await screen.findByRole('button', { name: /reporting/i })).toBeDisabled()
    resolve()
  })

  it('does not call onSubmit when submitted without a reason selected', () => {
    renderModal()
    const form = screen.getByRole('button', { name: /submit report/i }).closest('form')
    fireEvent.submit(form)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
