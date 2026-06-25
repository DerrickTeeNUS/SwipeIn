import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { auth, db } from '../firebase'
import './SwipePage.css'

const SWIPE_THRESHOLD = 100
const FLY_MS = 380

function getFilteredProfiles(sourceProfiles, filters, role) {
  const location = filters.location.trim().toLowerCase()
  const industry = filters.industry.trim().toLowerCase()
  const skills = filters.skills.trim().toLowerCase()
  const university = filters.university.trim().toLowerCase()

  return sourceProfiles.filter((profile) => {
    if (location && !String(profile.location || '').toLowerCase().includes(location)) {
      return false
    }

    if (role === 'student') {
      if (industry && !String(profile.industry || '').toLowerCase().includes(industry)) {
        return false
      }
    } else {
      const skillText = (profile.skills || []).join(' ').toLowerCase()
      if (skills && !skillText.includes(skills)) {
        return false
      }
      if (university && !String(profile.university || '').toLowerCase().includes(university)) {
        return false
      }
    }

    return true
  })
}

export default function SwipePage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [allProfiles, setAllProfiles] = useState([])
  const [profiles, setProfiles] = useState([])
  const [index, setIndex] = useState(0)
  const [filters, setFilters] = useState({ location: '', industry: '', skills: '', university: '' })
  const [loading, setLoading] = useState(true)
  const [matchedProfile, setMatchedProfile] = useState(null)
  const topCardRef = useRef(null)
  const isSwiping = useRef(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { navigate('/login'); return }
      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        const data = snap.exists() ? snap.data() : {}
        const role = data.role || 'student'
        const oppositeRole = role === 'student' ? 'professional' : 'student'
        setCurrentUser({ ...data, uid: user.uid })

        const [profilesSnap, swipesSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'users'),
            where('role', '==', oppositeRole),
          )),
          getDocs(query(collection(db, 'swipes'), where('from', '==', user.uid))),
        ])

        const swipedIds = new Set(swipesSnap.docs.map(d => d.data().to))
        const allOpposite = profilesSnap.docs.map(d => ({ ...d.data(), uid: d.id }))
        const visibleOpposite = allOpposite.filter(p => p.uid !== user.uid && !swipedIds.has(p.uid))

        setAllProfiles(visibleOpposite)
      } catch (err) {
        console.error('SwipePage load error:', err)
      } finally {
        setLoading(false)
      }
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!currentUser) return
    const nextProfiles = getFilteredProfiles(allProfiles, filters, currentUser.role || 'student')
    setProfiles(nextProfiles)
    setIndex(0)
  }, [allProfiles, currentUser, filters])

  const handleFilterChange = useCallback((event) => {
    const { name, value } = event.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({ location: '', industry: '', skills: '', university: '' })
  }, [])

  const doSwipe = useCallback(async (dir, profile) => {
    if (!currentUser || !profile) return
    try {
      await setDoc(doc(db, 'swipes', `${currentUser.uid}_${profile.uid}`), {
        from: currentUser.uid,
        to: profile.uid,
        direction: dir,
        createdAt: serverTimestamp(),
      })
      if (dir === 'like') {
        const reverseSnap = await getDoc(doc(db, 'swipes', `${profile.uid}_${currentUser.uid}`))
        if (reverseSnap.exists() && reverseSnap.data().direction === 'like') {
          const matchId = [currentUser.uid, profile.uid].sort().join('_')
          await setDoc(doc(db, 'matches', matchId), {
            users: [currentUser.uid, profile.uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: '',
            lastMessageAt: null,
          }, { merge: true })
          setMatchedProfile(profile)
        }
      }
    } catch (err) {
      console.error('Swipe write error:', err)
    }
  }, [currentUser])

  // Called by the card after a drag swipe
  const handleDragSwipe = useCallback((dir) => {
    const profile = profiles[index]
    if (!profile) return
    setIndex(i => i + 1)
    doSwipe(dir, profile)
  }, [profiles, index, doSwipe])

  // Called by the action buttons
  const handleButtonSwipe = useCallback((dir) => {
    if (isSwiping.current || index >= profiles.length) return
    isSwiping.current = true
    const profile = profiles[index]
    topCardRef.current?.triggerSwipe(dir)
    doSwipe(dir, profile)
    setTimeout(() => {
      setIndex(i => i + 1)
      isSwiping.current = false
    }, FLY_MS)
  }, [profiles, index, doSwipe])

  if (loading) {
    return (
      <div className="swipe-page">
        <p className="swipe-loading">Finding matches…</p>
      </div>
    )
  }

  const visibleProfiles = profiles.slice(index, index + 3)
  const hasActiveFilters = Object.values(filters).some(value => String(value).trim())

  return (
    <div className="swipe-page">
      <header className="swipe-header">
        <Link to="/home" className="swipe-nav-btn" aria-label="Back to home">
          <ArrowLeftIcon />
        </Link>
        <span className="swipe-brand">SwipeIn</span>
        <div className="swipe-nav-spacer" />
      </header>

      <div className="swipe-filters" aria-label="Swipe feed filters">
        <label className="swipe-filter-field">
          <span>Location</span>
          <input
            name="location"
            value={filters.location}
            onChange={handleFilterChange}
            placeholder="Any city"
            aria-label="Location"
          />
        </label>

        {currentUser?.role === 'student' ? (
          <label className="swipe-filter-field">
            <span>Industry</span>
            <input
              name="industry"
              value={filters.industry}
              onChange={handleFilterChange}
              placeholder="e.g. technology"
              aria-label="Industry"
            />
          </label>
        ) : (
          <>
            <label className="swipe-filter-field">
              <span>Skills</span>
              <input
                name="skills"
                value={filters.skills}
                onChange={handleFilterChange}
                placeholder="e.g. design"
                aria-label="Skills"
              />
            </label>
            <label className="swipe-filter-field">
              <span>University</span>
              <input
                name="university"
                value={filters.university}
                onChange={handleFilterChange}
                placeholder="Any school"
                aria-label="University"
              />
            </label>
          </>
        )}

        {hasActiveFilters && (
          <button type="button" className="swipe-filter-clear" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      <div className="swipe-area">
        {visibleProfiles.length === 0 ? (
          <div className="swipe-empty">
            <div className="swipe-empty-icon"><SparkleIcon /></div>
            <h2>{hasActiveFilters ? 'No matches for those filters' : "You've seen everyone!"}</h2>
            <p>{hasActiveFilters ? 'Try widening your filters to see more people.' : 'Check back later for new profiles.'}</p>
            <Link to="/home" className="swipe-empty-btn">Back to home</Link>
          </div>
        ) : (
          <div className="card-stack">
            {visibleProfiles.map((profile, stackIndex) => (
              <SwipeCard
                key={profile.uid}
                ref={stackIndex === 0 ? topCardRef : null}
                profile={profile}
                stackIndex={stackIndex}
                onDragSwipe={handleDragSwipe}
              />
            ))}
          </div>
        )}
      </div>

      {visibleProfiles.length > 0 && (
        <div className="swipe-actions">
          <button className="action-btn pass-btn" onClick={() => handleButtonSwipe('pass')} aria-label="Pass">
            <XIcon />
          </button>
          <button className="action-btn like-btn" onClick={() => handleButtonSwipe('like')} aria-label="Like">
            <HeartIcon />
          </button>
        </div>
      )}

      {matchedProfile && (
        <MatchModal
          currentUser={currentUser}
          matched={matchedProfile}
          onClose={() => setMatchedProfile(null)}
        />
      )}
    </div>
  )
}

// ─── Swipe Card ──────────────────────────────────────────────────────────────

const SwipeCard = forwardRef(function SwipeCard({ profile, stackIndex, onDragSwipe }, ref) {
  const cardRef = useRef(null)
  const drag = useRef({ active: false, startX: 0, x: 0 })
  const [stamp, setStamp] = useState(null) // 'like' | 'pass' | null

  useImperativeHandle(ref, () => ({
    triggerSwipe(dir) {
      flyOff(dir)
    },
  }))

  function flyOff(dir) {
    const el = cardRef.current
    if (!el) return
    el.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`
    el.style.transform = dir === 'like'
      ? 'translateX(130vw) rotate(25deg)'
      : 'translateX(-130vw) rotate(-25deg)'
  }

  function onPointerDown(e) {
    if (stackIndex !== 0) return
    drag.current = { active: true, startX: e.clientX, x: 0 }
    cardRef.current.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e) {
    if (!drag.current.active) return
    const dx = e.clientX - drag.current.startX
    drag.current.x = dx
    cardRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.06}deg)`
    if (dx > 30) setStamp('like')
    else if (dx < -30) setStamp('pass')
    else setStamp(null)
  }

  function onPointerUp() {
    if (!drag.current.active) return
    drag.current.active = false
    setStamp(null)
    const dx = drag.current.x
    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      const dir = dx > 0 ? 'like' : 'pass'
      flyOff(dir)
      onDragSwipe(dir)
    } else {
      const el = cardRef.current
      el.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      el.style.transform = 'none'
      setTimeout(() => { if (el) el.style.transition = '' }, 350)
    }
  }

  const isTop = stackIndex === 0
  const initials = profile.displayName
    ? profile.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const stackStyle = stackIndex > 0 ? {
    transform: `scale(${1 - stackIndex * 0.04}) translateY(${stackIndex * 14}px)`,
    zIndex: 10 - stackIndex,
    pointerEvents: 'none',
  } : { zIndex: 10 }

  return (
    <div
      ref={cardRef}
      className={`swipe-card${isTop ? ' is-top' : ''}`}
      style={stackStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {isTop && (
        <>
          <div className={`swipe-stamp like-stamp${stamp === 'like' ? ' visible' : ''}`}>LIKE</div>
          <div className={`swipe-stamp pass-stamp${stamp === 'pass' ? ' visible' : ''}`}>PASS</div>
        </>
      )}

      <div className="card-body">
        {/* Header */}
        <div className="card-header">
          <div className="card-avatar-wrap">
            {profile.photoURL
              ? <img src={profile.photoURL} alt={profile.displayName} className="card-avatar-img" />
              : <span className="card-avatar-initials">{initials}</span>
            }
          </div>
          <div className="card-header-info">
            <p className="card-name">{profile.displayName || (profile.role === 'student' ? 'Student' : 'Professional')}</p>
            {profile.bio && <p className="card-bio">{profile.bio}</p>}
            {profile.location && <p className="card-location"><LocationIcon /> {profile.location}</p>}
          </div>
        </div>

        {/* About */}
        {profile.about && (
          <div className="card-section">
            <p className="card-section-label">About</p>
            <p className="card-section-text">{profile.about}</p>
          </div>
        )}

        {/* Student fields */}
        {profile.role === 'student' && (
          <>
            {profile.university && (
              <div className="card-section">
                <p className="card-section-label">Education</p>
                <p className="card-detail"><GradIcon /> {[profile.university, profile.major].filter(Boolean).join(' · ')}</p>
                {profile.gradYear && <p className="card-sub">Class of {profile.gradYear}</p>}
              </div>
            )}
            {profile.skills?.length > 0 && (
              <div className="card-section">
                <p className="card-section-label">Skills</p>
                <div className="card-skills">
                  {profile.skills.slice(0, 5).map(s => <span key={s} className="card-skill-tag">{s}</span>)}
                  {profile.skills.length > 5 && <span className="card-skill-tag">+{profile.skills.length - 5}</span>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Professional fields */}
        {profile.role === 'professional' && (
          <>
            {profile.company && (
              <div className="card-section">
                <p className="card-section-label">Company</p>
                <p className="card-detail"><BriefcaseIcon /> {[profile.company, profile.jobTitle].filter(Boolean).join(' · ')}</p>
                {profile.industry && <p className="card-sub">{profile.industry}</p>}
              </div>
            )}
            {profile.lookingFor && (
              <div className="card-section">
                <p className="card-section-label">Looking for in an intern</p>
                <p className="card-section-text">{profile.lookingFor}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})

// ─── Match Modal ─────────────────────────────────────────────────────────────

function MatchModal({ currentUser, matched, onClose }) {
  const navigate = useNavigate()
  const currentInitials = currentUser.displayName
    ? currentUser.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'
  const matchedInitials = matched.displayName
    ? matched.displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <div className="match-overlay">
      <div className="match-modal">
        <h2 className="match-title">It's a Match!</h2>
        <p className="match-sub">You and {matched.displayName} matched</p>
        <div className="match-avatars">
          <div className="match-avatar">
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt={currentUser.displayName} />
              : <span>{currentInitials}</span>}
          </div>
          <div className="match-heart"><HeartIcon /></div>
          <div className="match-avatar">
            {matched.photoURL
              ? <img src={matched.photoURL} alt={matched.displayName} />
              : <span>{matchedInitials}</span>}
          </div>
        </div>
        <div className="match-actions">
          <button className="match-action-btn match-action-secondary" onClick={onClose}>
            Keep swiping
          </button>
          <button
            className="match-action-btn"
            onClick={() => {
              onClose()
              navigate('/messages')
            }}
          >
            Start chatting
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Icons ───────────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function GradIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}
