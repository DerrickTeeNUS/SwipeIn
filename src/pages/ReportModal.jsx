import { useState } from 'react'
import './ReportModal.css'

const REASONS = [
  'Inappropriate content',
  'Spam or fake profile',
  'Harassment',
  'Misleading information',
  'Other',
]

export default function ReportModal({ reportedName, onSubmit, onClose }) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason) return
    setSubmitting(true)
    await onSubmit(reason)
    setSubmitting(false)
  }

  return (
    <div className="report-overlay" onClick={onClose}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>
        <h2 className="report-title">Report profile</h2>
        <p className="report-sub">
          Why are you reporting {reportedName || 'this profile'}?
        </p>
        <form className="report-form" onSubmit={handleSubmit}>
          <div className="report-reasons">
            {REASONS.map(r => (
              <label key={r} className={`report-reason${reason === r ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                />
                {r}
              </label>
            ))}
          </div>
          <div className="report-footer">
            <button type="button" className="report-cancel" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="report-submit"
              disabled={!reason || submitting}
            >
              {submitting ? 'Reporting…' : 'Submit report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
