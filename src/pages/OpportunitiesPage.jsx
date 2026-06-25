import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import './OpportunitiesPage.css'

const EMPTY_FORM = {
  title: '',
  type: 'internship',
  description: '',
  location: '',
  industry: '',
  skills: [],
  isPaid: false,
  duration: '',
  deadline: '',
}

const INDUSTRIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'media', label: 'Media & Entertainment' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'education', label: 'Education' },
  { value: 'government', label: 'Government & Nonprofit' },
  { value: 'other', label: 'Other' },
]

function OpportunitiesPage() {
  const navigate = useNavigate()
  const [uid, setUid] = useState('')
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('opportunities')

  const [opportunities, setOpportunities] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [skillInput, setSkillInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [applications, setApplications] = useState([])
  const [appsLoaded, setAppsLoaded] = useState(false)
  const [filterOpp, setFilterOpp] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/login'); return }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (!snap.exists() || snap.data().role !== 'professional') {
          navigate('/home')
          return
        }
        setProfile({ uid: user.uid, ...snap.data() })
        setUid(user.uid)
        const opps = await fetchOpportunities(user.uid)
        setOpportunities(opps)
      } catch {
        // continue
      }
      setLoading(false)
    })
    return unsub
  }, [navigate])

  async function fetchOpportunities(userId) {
    const snap = await getDocs(
      query(collection(db, 'opportunities'), where('professionalId', '==', userId))
    )
    const opps = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    opps.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    return opps
  }

  async function loadApplications(opps) {
    if (appsLoaded) return
    const oppIds = opps.map(o => o.id)
    if (oppIds.length === 0) { setAppsLoaded(true); return }

    const chunks = []
    for (let i = 0; i < oppIds.length; i += 30) chunks.push(oppIds.slice(i, i + 30))

    const allApps = []
    for (const chunk of chunks) {
      const snap = await getDocs(
        query(collection(db, 'applications'), where('opportunityId', 'in', chunk))
      )
      allApps.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    allApps.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    setApplications(allApps)
    setAppsLoaded(true)
  }

  function handleTabChange(tab) {
    setActiveTab(tab)
    if (tab === 'applications') loadApplications(opportunities)
  }

  function openNewForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSkillInput('')
    setFormError('')
    setShowForm(true)
  }

  function openEditForm(opp) {
    setEditingId(opp.id)
    setForm({
      title: opp.title || '',
      type: opp.type || 'internship',
      description: opp.description || '',
      location: opp.location || '',
      industry: opp.industry || '',
      skills: opp.skills || [],
      isPaid: opp.isPaid || false,
      duration: opp.duration || '',
      deadline: opp.deadline || '',
    })
    setSkillInput('')
    setFormError('')
    setShowForm(true)
  }

  function handleFormChange(e) {
    const { name, value, type: t, checked } = e.target
    setForm(prev => ({ ...prev, [name]: t === 'checkbox' ? checked : value }))
  }

  function handleSkillKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
      e.preventDefault()
      const skill = skillInput.trim().replace(/,+$/, '')
      if (skill && !form.skills.includes(skill)) {
        setForm(prev => ({ ...prev, skills: [...prev.skills, skill] }))
      }
      setSkillInput('')
    }
  }

  function removeSkill(skill) {
    setForm(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skill) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { setFormError('Title is required'); return }
    if (!form.description.trim()) { setFormError('Description is required'); return }
    setFormError('')
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        professionalId: uid,
        professionalName: profile.displayName || '',
        professionalPhotoURL: profile.photoURL || '',
        company: profile.company || '',
        jobTitle: profile.jobTitle || '',
        updatedAt: serverTimestamp(),
      }
      if (editingId) {
        await updateDoc(doc(db, 'opportunities', editingId), payload)
        setOpportunities(prev =>
          prev.map(o => o.id === editingId ? { ...o, ...payload } : o)
        )
      } else {
        payload.createdAt = serverTimestamp()
        const ref = await addDoc(collection(db, 'opportunities'), payload)
        setOpportunities(prev => [{ id: ref.id, ...payload }, ...prev])
      }
      setShowForm(false)
    } catch (err) {
      setFormError('Failed to save: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(oppId) {
    if (!window.confirm('Delete this opportunity? This cannot be undone.')) return
    try {
      await deleteDoc(doc(db, 'opportunities', oppId))
      setOpportunities(prev => prev.filter(o => o.id !== oppId))
      setApplications(prev => prev.filter(a => a.opportunityId !== oppId))
    } catch {
      // ignore
    }
  }

  async function handleUpdateStatus(appId, status) {
    try {
      await updateDoc(doc(db, 'applications', appId), { status })
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status } : a))

      if (status === 'accepted') {
        const app = applications.find(a => a.id === appId)
        if (app) {
          const matchId = [uid, app.studentId].sort().join('_')
          await setDoc(doc(db, 'matches', matchId), {
            users: [uid, app.studentId],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: '',
            lastMessageAt: null,
          }, { merge: true })
        }
      }
    } catch {
      // ignore
    }
  }

  const filteredApps = applications.filter(a => {
    if (filterOpp !== 'all' && a.opportunityId !== filterOpp) return false
    if (filterStatus !== 'all' && a.status !== filterStatus) return false
    return true
  })

  const appCountByOpp = applications.reduce((acc, a) => {
    acc[a.opportunityId] = (acc[a.opportunityId] || 0) + 1
    return acc
  }, {})

  if (loading) {
    return <div className="opp-page"><p className="opp-loading">Loading…</p></div>
  }

  return (
    <div className="opp-page">
      <header className="opp-header">
        <div>
          <p className="eyebrow">SwipeIn</p>
          <h1>Opportunities</h1>
        </div>
        <div className="opp-header-actions">
          <Link to="/home" className="secondary-button" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
            Home
          </Link>
          <button className="opp-post-btn" onClick={openNewForm}>+ Post opportunity</button>
        </div>
      </header>

      <div className="opp-tabs">
        <button
          className={`opp-tab${activeTab === 'opportunities' ? ' active' : ''}`}
          onClick={() => handleTabChange('opportunities')}
        >
          My opportunities
          {opportunities.length > 0 && (
            <span className="tab-badge">{opportunities.length}</span>
          )}
        </button>
        <button
          className={`opp-tab${activeTab === 'applications' ? ' active' : ''}`}
          onClick={() => handleTabChange('applications')}
        >
          Applications
          {appsLoaded && applications.length > 0 && (
            <span className="tab-badge">{applications.length}</span>
          )}
        </button>
      </div>

      {/* MY OPPORTUNITIES */}
      {activeTab === 'opportunities' && (
        <div className="opp-list-panel">
          {opportunities.length === 0 ? (
            <div className="opp-empty-state">
              <BriefcaseIcon />
              <h3>No opportunities posted yet</h3>
              <p>Post an internship or mentorship opportunity to start receiving applications from students.</p>
              <button className="opp-post-btn" onClick={openNewForm}>Post your first opportunity</button>
            </div>
          ) : (
            <div className="opp-list">
              {opportunities.map(opp => (
                <div key={opp.id} className="opp-row">
                  <div className="opp-row-main">
                    <span className={`type-badge ${opp.type}`}>{opp.type}</span>
                    <div className="opp-row-text">
                      <p className="opp-row-title">{opp.title}</p>
                      <p className="opp-row-meta">
                        {[opp.location, opp.industry, opp.duration].filter(Boolean).join(' · ')}
                        {opp.deadline ? ` · Deadline ${opp.deadline}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="opp-row-actions">
                    {appsLoaded && (
                      <span className="app-count-chip">
                        {appCountByOpp[opp.id] || 0} applied
                      </span>
                    )}
                    <button className="ghost-btn" onClick={() => openEditForm(opp)}>Edit</button>
                    <button className="ghost-btn danger" onClick={() => handleDelete(opp.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* APPLICATIONS */}
      {activeTab === 'applications' && (
        <div className="apps-panel">
          <div className="apps-filters">
            <div className="filter-group">
              <label htmlFor="filter-opp">Opportunity</label>
              <div className="select-wrapper">
                <select id="filter-opp" value={filterOpp} onChange={e => setFilterOpp(e.target.value)}>
                  <option value="all">All opportunities</option>
                  {opportunities.map(o => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
                <span className="select-chevron"><ChevronIcon /></span>
              </div>
            </div>
            <div className="filter-group">
              <label htmlFor="filter-status">Status</label>
              <div className="select-wrapper">
                <select id="filter-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <span className="select-chevron"><ChevronIcon /></span>
              </div>
            </div>
          </div>

          {filteredApps.length === 0 ? (
            <div className="opp-empty-state">
              <InboxIcon />
              <h3>No applications yet</h3>
              <p>When students apply to your opportunities, their applications will appear here.</p>
            </div>
          ) : (
            <div className="app-list">
              {filteredApps.map(app => (
                <div key={app.id} className={`app-card status-${app.status}`}>
                  <div className="app-card-top">
                    <div className="app-student">
                      {app.studentPhotoURL ? (
                        <img src={app.studentPhotoURL} alt={app.studentName} className="app-avatar" />
                      ) : (
                        <div className="app-avatar-fallback">
                          {app.studentName?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <div>
                        <p className="app-student-name">{app.studentName}</p>
                        <p className="app-student-meta">
                          {[app.studentUniversity, app.studentMajor, app.studentGradYear ? `Class of ${app.studentGradYear}` : ''].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <span className={`status-pill ${app.status}`}>{app.status}</span>
                  </div>

                  <p className="app-for-label">
                    Applied to: <strong>{opportunities.find(o => o.id === app.opportunityId)?.title || '—'}</strong>
                  </p>

                  {app.studentBio && <p className="app-bio">{app.studentBio}</p>}

                  {app.studentSkills?.length > 0 && (
                    <div className="app-skills">
                      {app.studentSkills.slice(0, 6).map(s => (
                        <span key={s} className="skill-chip">{s}</span>
                      ))}
                    </div>
                  )}

                  {app.message && (
                    <div className="app-message-box">
                      <p className="app-message-label">Cover note</p>
                      <p className="app-message-text">{app.message}</p>
                    </div>
                  )}

                  <div className="app-card-actions">
                    <Link
                      to={`/student/${app.studentId}`}
                      className="ghost-btn"
                      style={{ textDecoration: 'none' }}
                    >
                      View profile
                    </Link>
                    {app.status === 'pending' && (
                      <>
                        <button className="accept-btn" onClick={() => handleUpdateStatus(app.id, 'accepted')}>
                          Accept
                        </button>
                        <button className="reject-btn" onClick={() => handleUpdateStatus(app.id, 'rejected')}>
                          Reject
                        </button>
                      </>
                    )}
                    {app.status === 'accepted' && (
                      <button className="ghost-btn" onClick={() => handleUpdateStatus(app.id, 'pending')}>
                        Undo
                      </button>
                    )}
                    {app.status === 'rejected' && (
                      <button className="accept-btn" onClick={() => handleUpdateStatus(app.id, 'pending')}>
                        Reconsider
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div className="modal-sheet">
            <div className="modal-head">
              <h2>{editingId ? 'Edit opportunity' : 'New opportunity'}</h2>
              <button className="modal-close-btn" onClick={() => setShowForm(false)} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <form className="opp-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="opp-title">Title *</label>
                <input
                  id="opp-title"
                  name="title"
                  type="text"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="e.g. Summer Software Engineering Intern"
                  maxLength={120}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="opp-type">Type *</label>
                  <div className="select-wrapper">
                    <select id="opp-type" name="type" value={form.type} onChange={handleFormChange}>
                      <option value="internship">Internship</option>
                      <option value="mentorship">Mentorship</option>
                    </select>
                    <span className="select-chevron"><ChevronIcon /></span>
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="opp-industry">Industry</label>
                  <div className="select-wrapper">
                    <select id="opp-industry" name="industry" value={form.industry} onChange={handleFormChange}>
                      <option value="">Select industry</option>
                      {INDUSTRIES.map(i => (
                        <option key={i.value} value={i.value}>{i.label}</option>
                      ))}
                    </select>
                    <span className="select-chevron"><ChevronIcon /></span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="opp-desc">Description *</label>
                <textarea
                  id="opp-desc"
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  placeholder="Describe the role, responsibilities, and what students will learn…"
                  rows={4}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="opp-location">Location</label>
                  <input
                    id="opp-location"
                    name="location"
                    type="text"
                    value={form.location}
                    onChange={handleFormChange}
                    placeholder="New York, NY or Remote"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="opp-duration">Duration</label>
                  <input
                    id="opp-duration"
                    name="duration"
                    type="text"
                    value={form.duration}
                    onChange={handleFormChange}
                    placeholder="e.g. 10 weeks"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="opp-deadline">Application deadline</label>
                  <input
                    id="opp-deadline"
                    name="deadline"
                    type="date"
                    value={form.deadline}
                    onChange={handleFormChange}
                  />
                </div>
                {form.type === 'internship' && (
                  <div className="form-group form-group-check">
                    <label className="check-label">
                      <input
                        type="checkbox"
                        name="isPaid"
                        checked={form.isPaid}
                        onChange={handleFormChange}
                      />
                      Paid internship
                    </label>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Required skills</label>
                <div className="skills-container">
                  {form.skills.map(s => (
                    <span key={s} className="skill-tag">
                      {s}
                      <button
                        type="button"
                        className="skill-remove"
                        onClick={() => removeSkill(s)}
                        aria-label={`Remove ${s}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="skills-inline-input"
                    value={skillInput}
                    onChange={e => setSkillInput(e.target.value)}
                    onKeyDown={handleSkillKeyDown}
                    placeholder={form.skills.length === 0 ? 'e.g. React, Python…' : ''}
                  />
                </div>
                <p className="field-hint">Press Enter or comma after each skill</p>
              </div>

              {formError && <p className="error-text">{formError}</p>}

              <div className="form-actions">
                <button type="button" className="ghost-btn" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="opp-post-btn" disabled={submitting}>
                  {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Post opportunity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#c084fc', marginBottom: 16 }}>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="12" />
      <path d="M2 12h20" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#c084fc', marginBottom: 16 }}>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export default OpportunitiesPage
