import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  doc, getDoc, getDocs, addDoc, deleteDoc,
  collection, query, orderBy, limit, where, serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import './HomePage.css'

function HomePage() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const [userProfile, setUserProfile] = useState(null)
  const navigate = useNavigate()

  // Student feed state
  const [opportunities, setOpportunities] = useState([])
  const [appliedIds, setAppliedIds] = useState(new Set())
  const [myApplications, setMyApplications] = useState([])
  const [feedLoading, setFeedLoading] = useState(false)

  // Apply modal state
  const [applyModal, setApplyModal] = useState(null)
  const [applyMessage, setApplyMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login')
        return
      }
      setUser(firebaseUser)
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        if (snap.exists()) {
          const data = snap.data()
          setUserRole(data.role || '')
          setUserProfile(data)
          if (data.role === 'student') {
            loadFeed(firebaseUser.uid)
          }
        }
      } catch {
        // role stays empty
      }
    })
    return () => unsubscribe()
  }, [navigate])

  async function loadFeed(uid) {
    setFeedLoading(true)
    try {
      const [matchesSnap, appSnap] = await Promise.all([
        getDocs(query(collection(db, 'matches'), where('users', 'array-contains', uid))),
        getDocs(query(collection(db, 'applications'), where('studentId', '==', uid))),
      ])

      const matchedProfessionalIds = new Set(
        matchesSnap.docs
          .map(d => (d.data().users || []).find(id => id !== uid))
          .filter(Boolean)
      )

      if (matchedProfessionalIds.size > 0) {
        const oppSnap = await getDocs(
          query(collection(db, 'opportunities'), orderBy('createdAt', 'desc'), limit(30))
        )
        const filtered = oppSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(opp => matchedProfessionalIds.has(opp.professionalId))
        setOpportunities(filtered)
      } else {
        setOpportunities([])
      }

      const apps = appSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMyApplications(apps)
      setAppliedIds(new Set(apps.map(a => a.opportunityId)))
    } catch {
      // feed stays empty
    } finally {
      setFeedLoading(false)
    }
  }

  async function submitApplication() {
    if (!applyModal || !user) return
    setApplying(true)
    setApplyError('')
    try {
      const newApp = {
        opportunityId: applyModal.id,
        opportunityTitle: applyModal.title,
        professionalId: applyModal.professionalId || '',
        professionalName: applyModal.professionalName || '',
        company: applyModal.company || '',
        studentId: user.uid,
        studentName: user.displayName || '',
        studentPhotoURL: userProfile?.photoURL || '',
        studentBio: userProfile?.bio || '',
        studentUniversity: userProfile?.university || '',
        studentMajor: userProfile?.major || '',
        studentGradYear: userProfile?.gradYear || '',
        studentSkills: userProfile?.skills || [],
        message: applyMessage.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
      }
      const ref = await addDoc(collection(db, 'applications'), newApp)
      setAppliedIds(prev => new Set([...prev, applyModal.id]))
      setMyApplications(prev => [{ id: ref.id, ...newApp }, ...prev])
      setApplyModal(null)
      setApplyMessage('')
    } catch (err) {
      setApplyError('Could not submit application. Please try again.')
      console.error(err)
    } finally {
      setApplying(false)
    }
  }

  async function deleteApplication(id) {
    setMyApplications(prev => prev.filter(a => a.id !== id))
    try {
      await deleteDoc(doc(db, 'applications', id))
    } catch (err) {
      console.error('Failed to delete application:', err)
    }
  }

  function closeApplyModal() {
    setApplyModal(null)
    setApplyMessage('')
    setApplyError('')
  }

  const handleSignOut = async () => {
    await signOut(auth)
    navigate('/login')
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <div>
          <p className="eyebrow">SwipeIn dashboard</p>
          <h1>Welcome back{user?.displayName ? `, ${user.displayName}` : ''}</h1>
          <p className="hero-text">
            Discover internship matches, manage your opportunities, and stay connected with students and hirers.
          </p>
        </div>
        <nav className="home-nav">
          <Link
            to={userRole === 'professional' ? `/professional/${user?.uid}` : `/student/${user?.uid}`}
            className="home-nav-link"
          >
            View profile
          </Link>
          <Link to="/profile" className="home-nav-link">
            Edit profile
          </Link>
          {userRole === 'professional' && (
            <Link to="/opportunities" className="home-nav-link">
              Opportunities
            </Link>
          )}
          <Link to="/messages" className="home-nav-link">
            Messages
          </Link>
          <button className="home-nav-link home-nav-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </nav>
      </header>

      {/* STUDENT: my applications + feed */}
      {userRole === 'student' && (
        <>
          <div className="swipe-cta-wrap">
            <Link to="/swipe" className="swipe-cta">
              <span className="swipe-cta-label">Start swiping</span>
              <span className="swipe-cta-sub">Find your next internship match</span>
              <span className="swipe-cta-arrow">→</span>
            </Link>
          </div>

          {/* MY APPLICATIONS */}
          {myApplications.length > 0 && (
            <section className="my-apps-section">
              <h2 className="feed-heading">My applications</h2>
              <div className="my-apps-list">
                {myApplications.map(app => (
                  <ApplicationStatusCard key={app.id} app={app} onDelete={deleteApplication} />
                ))}
              </div>
            </section>
          )}

          {/* OPPORTUNITIES FEED */}
          <section className="feed-section">
            <h2 className="feed-heading">Opportunities for you</h2>

            {feedLoading && (
              <div className="feed-loading">
                <div className="feed-spinner" />
                <p>Finding opportunities…</p>
              </div>
            )}

            {!feedLoading && opportunities.length === 0 && (
              <div className="feed-empty">
                <p className="feed-empty-title">No opportunities yet</p>
                <p className="feed-empty-sub">
                  Match with professionals first — their opportunities will appear here once you connect.
                </p>
              </div>
            )}

            {!feedLoading && opportunities.length > 0 && (
              <div className="feed-list">
                {opportunities.map(opp => (
                  <OppCard
                    key={opp.id}
                    opp={opp}
                    applied={appliedIds.has(opp.id)}
                    onApply={() => setApplyModal(opp)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* PROFESSIONAL: existing grid */}
      {userRole === 'professional' && (
        <>
          <div className="prof-cta-wrap">
            <Link to="/opportunities" className="swipe-cta">
              <span className="swipe-cta-label">Post an opportunity</span>
              <span className="swipe-cta-sub">Reach students looking for internships and mentorship</span>
              <span className="swipe-cta-arrow">→</span>
            </Link>
            <Link to="/swipe" className="swipe-cta swipe-cta--secondary">
              <span className="swipe-cta-label">Discover student profiles</span>
              <span className="swipe-cta-sub">Swipe through candidates looking for opportunities</span>
              <span className="swipe-cta-arrow">→</span>
            </Link>
          </div>

          <section className="home-grid">
            <article className="home-card">
              <h2>Find your best fit</h2>
              <p>Browse curated student profiles that match the skills and qualities you're looking for.</p>
            </article>
            <article className="home-card">
              <h2>Connect with students</h2>
              <p>Message candidates directly and let your company do the talking.</p>
            </article>
            <article className="home-card">
              <h2>Track applications</h2>
              <p>Review, accept, and manage every student application from one place.</p>
            </article>
            <article className="home-card">
              <h2>Build your pipeline</h2>
              <p>Grow a pool of talented interns and mentees who are eager to work with you.</p>
            </article>
          </section>
        </>
      )}

      {/* APPLY MODAL */}
      {applyModal && (
        <div
          className="apply-overlay"
          onClick={e => { if (e.target === e.currentTarget) closeApplyModal() }}
        >
          <div className="apply-sheet">
            <div className="apply-sheet-head">
              <div>
                <p className="apply-sheet-eyebrow">
                  {applyModal.company || applyModal.professionalName}
                </p>
                <h3 className="apply-sheet-title">{applyModal.title}</h3>
              </div>
              <button className="apply-close-btn" onClick={closeApplyModal} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="apply-sheet-meta">
              {applyModal.type && (
                <span className={`type-badge ${applyModal.type}`}>{applyModal.type}</span>
              )}
              {applyModal.location && <span className="meta-chip">📍 {applyModal.location}</span>}
              {applyModal.type === 'internship' && (
                <span className="meta-chip">{applyModal.isPaid ? '💰 Paid' : 'Unpaid'}</span>
              )}
              {applyModal.deadline && (
                <span className="meta-chip">⏰ Deadline {applyModal.deadline}</span>
              )}
            </div>

            <div className="apply-form-group">
              <label htmlFor="apply-message">
                Cover note <span style={{ fontWeight: 400, color: 'var(--text)' }}>(optional)</span>
              </label>
              <textarea
                id="apply-message"
                value={applyMessage}
                onChange={e => setApplyMessage(e.target.value)}
                placeholder="Why are you interested in this opportunity? What makes you a great fit?"
                rows={4}
              />
            </div>

            {applyError && <p className="apply-error">{applyError}</p>}

            <div className="apply-sheet-actions">
              <button className="apply-cancel-btn" onClick={closeApplyModal}>Cancel</button>
              <button
                className="apply-submit-btn"
                onClick={submitApplication}
                disabled={applying}
              >
                {applying ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ApplicationStatusCard({ app, onDelete }) {
  const isDone = app.status === 'accepted' || app.status === 'rejected'
  return (
    <div className={`app-status-card status-${app.status}`}>
      <div className="app-status-card-left">
        <p className="app-status-title">{app.opportunityTitle}</p>
        <p className="app-status-meta">
          {[app.company, app.professionalName].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="app-status-card-right">
        <span className={`app-status-pill ${app.status}`}>{app.status}</span>
        {app.status === 'accepted' && (
          <Link to="/messages" className="app-message-btn">
            Message →
          </Link>
        )}
        {isDone && (
          <button
            className="app-dismiss-btn"
            onClick={() => onDelete(app.id)}
            aria-label="Dismiss application"
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function OppCard({ opp, applied, onApply }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = opp.description?.length > 200

  return (
    <article className="opp-post-card">
      <div className="opp-post-header">
        {opp.professionalPhotoURL ? (
          <img src={opp.professionalPhotoURL} alt={opp.professionalName} className="post-avatar" />
        ) : (
          <div className="post-avatar-fallback">
            {opp.professionalName?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="post-author-info">
          <p className="post-author-name">{opp.professionalName}</p>
          <p className="post-author-meta">
            {[opp.jobTitle, opp.company].filter(Boolean).join(' at ')}
          </p>
        </div>
        <span className={`type-badge ${opp.type}`}>{opp.type}</span>
      </div>

      <div className="opp-post-body">
        <h3 className="opp-post-title">{opp.title}</h3>

        <p className="opp-post-desc">
          {isLong && !expanded
            ? <>{opp.description.slice(0, 200)}&hellip; <button className="expand-btn" onClick={() => setExpanded(true)}>more</button></>
            : <>{opp.description}{isLong && <> <button className="expand-btn" onClick={() => setExpanded(false)}>less</button></>}</>
          }
        </p>

        <div className="opp-post-meta">
          {opp.location && <span className="meta-chip">📍 {opp.location}</span>}
          {opp.duration && <span className="meta-chip">⏱ {opp.duration}</span>}
          {opp.industry && <span className="meta-chip">{opp.industry}</span>}
          {opp.type === 'internship' && (
            <span className="meta-chip">{opp.isPaid ? '💰 Paid' : 'Unpaid'}</span>
          )}
          {opp.deadline && <span className="meta-chip deadline-chip">⏰ Apply by {opp.deadline}</span>}
        </div>

        {opp.skills?.length > 0 && (
          <div className="opp-post-skills">
            {opp.skills.map(s => (
              <span key={s} className="skill-chip">{s}</span>
            ))}
          </div>
        )}
      </div>

      <div className="opp-post-footer">
        {applied ? (
          <span className="applied-badge">✓ Applied</span>
        ) : (
          <button className="apply-btn" onClick={onApply}>
            Apply now
          </button>
        )}
      </div>
    </article>
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

export default HomePage
