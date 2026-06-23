import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase'
import './ProfessionalProfilePage.css'

const INDUSTRY_LABELS = {
  technology: 'Technology',
  finance: 'Finance',
  healthcare: 'Healthcare',
  consulting: 'Consulting',
  media: 'Media & Entertainment',
  retail: 'Retail & E-commerce',
  education: 'Education',
  government: 'Government & Nonprofit',
  other: 'Other',
}

function ProfessionalProfilePage() {
  const { uid } = useParams()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [currentUid, setCurrentUid] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate('/login')
        return
      }
      setCurrentUid(user.uid)
    })
    return unsub
  }, [navigate])

  useEffect(() => {
    if (!uid) return

    async function fetchProfile() {
      try {
        const snap = await getDoc(doc(db, 'users', uid))
        if (!snap.exists()) {
          setNotFound(true)
        } else {
          const data = snap.data()
          if (data.role === 'student') {
            setNotFound(true)
          } else {
            setProfile(data)
          }
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [uid])

  if (loading) {
    return (
      <div className="pp-page">
        <div className="pp-loading">Loading profile…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="pp-page">
        <div className="pp-not-found">
          <h2>Profile not found</h2>
          <p>This professional profile doesn't exist or may have been removed.</p>
          <button className="pp-back-btn" onClick={() => navigate(-1)}>Go back</button>
        </div>
      </div>
    )
  }

  const isOwnProfile = currentUid === uid
  const initials = profile.displayName
    ? profile.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const industryLabel = INDUSTRY_LABELS[profile.industry] || profile.industry || null
  const workplaceLine = [profile.jobTitle, profile.company].filter(Boolean).join(' at ')

  return (
    <div className="pp-page">
      <div className="pp-inner">
        <button className="pp-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeftIcon /> Back
        </button>

        {/* Hero card */}
        <div className="pp-hero-card">
          <div className="pp-avatar">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.displayName} className="pp-avatar-img" />
            ) : (
              <span className="pp-avatar-initials">{initials}</span>
            )}
          </div>

          <div className="pp-hero-body">
            <div className="pp-hero-top">
              <div>
                <h1 className="pp-name">{profile.displayName || 'Professional'}</h1>
                {profile.bio && <p className="pp-headline">{profile.bio}</p>}
                {workplaceLine && (
                  <p className="pp-workplace">
                    <BriefcaseIcon /> {workplaceLine}
                  </p>
                )}
                {profile.location && (
                  <p className="pp-location">
                    <LocationIcon /> {profile.location}
                  </p>
                )}
              </div>

              <div className="pp-hero-actions">
                {isOwnProfile && (
                  <Link to="/profile" className="pp-edit-btn">
                    Edit profile
                  </Link>
                )}
                {profile.linkedinURL && (
                  <a
                    href={profile.linkedinURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pp-link-btn"
                  >
                    <LinkedInIcon /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pp-body">
          {/* About */}
          {profile.about && (
            <section className="pp-section-card">
              <h2 className="pp-section-title">About</h2>
              <p className="pp-about-text">{profile.about}</p>
            </section>
          )}

          {/* Company info */}
          {(profile.company || profile.industry) && (
            <section className="pp-section-card">
              <h2 className="pp-section-title">Company</h2>
              <div className="pp-company-row">
                <div className="pp-company-icon">
                  <BuildingIcon />
                </div>
                <div className="pp-company-details">
                  {profile.company && <p className="pp-company-name">{profile.company}</p>}
                  <p className="pp-company-sub">
                    {[profile.jobTitle, industryLabel].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Looking for */}
          {profile.lookingFor && (
            <section className="pp-section-card">
              <h2 className="pp-section-title">Looking for in an intern</h2>
              <p className="pp-about-text">{profile.lookingFor}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function BriefcaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  )
}

function BuildingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M2 9h20" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

export default ProfessionalProfilePage
