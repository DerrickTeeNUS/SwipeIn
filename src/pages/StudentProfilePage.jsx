import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../firebase'
import './StudentProfilePage.css'

function StudentProfilePage() {
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
          if (data.role === 'professional') {
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
      <div className="sp-page">
        <div className="sp-loading">Loading profile…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="sp-page">
        <div className="sp-not-found">
          <h2>Profile not found</h2>
          <p>This student profile doesn't exist or may have been removed.</p>
          <button className="sp-back-btn" onClick={() => navigate(-1)}>Go back</button>
        </div>
      </div>
    )
  }

  const isOwnProfile = currentUid === uid
  const initials = profile.displayName
    ? profile.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const gradYearLabel = profile.gradYear ? `Class of ${profile.gradYear}` : null

  return (
    <div className="sp-page">
      <div className="sp-inner">
        <button className="sp-back-btn" onClick={() => navigate(-1)}>
          <ArrowLeftIcon /> Back
        </button>

        {/* Hero card */}
        <div className="sp-hero-card">
          <div className="sp-avatar">
            {profile.photoURL ? (
              <img src={profile.photoURL} alt={profile.displayName} className="sp-avatar-img" />
            ) : (
              <span className="sp-avatar-initials">{initials}</span>
            )}
          </div>

          <div className="sp-hero-body">
            <div className="sp-hero-top">
              <div>
                <h1 className="sp-name">{profile.displayName || 'Student'}</h1>
                {profile.bio && <p className="sp-headline">{profile.bio}</p>}
                {profile.location && (
                  <p className="sp-location">
                    <LocationIcon /> {profile.location}
                  </p>
                )}
              </div>

              <div className="sp-hero-actions">
                {isOwnProfile && (
                  <Link to="/profile" className="sp-edit-btn">
                    Edit profile
                  </Link>
                )}
                {profile.portfolioURL && (
                  <a
                    href={profile.portfolioURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sp-link-btn"
                  >
                    <PortfolioIcon /> Portfolio
                  </a>
                )}
                {profile.linkedinURL && (
                  <a
                    href={profile.linkedinURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sp-link-btn"
                  >
                    <LinkedInIcon /> LinkedIn
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sp-body">
          {/* About */}
          {profile.about && (
            <section className="sp-section-card">
              <h2 className="sp-section-title">About</h2>
              <p className="sp-about-text">{profile.about}</p>
            </section>
          )}

          {/* Education */}
          {(profile.university || profile.major || profile.gradYear) && (
            <section className="sp-section-card">
              <h2 className="sp-section-title">Education</h2>
              <div className="sp-edu-row">
                <div className="sp-edu-icon">
                  <GraduationIcon />
                </div>
                <div className="sp-edu-details">
                  {profile.university && (
                    <p className="sp-edu-school">{profile.university}</p>
                  )}
                  <p className="sp-edu-sub">
                    {[profile.major, gradYearLabel].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Skills */}
          {profile.skills && profile.skills.length > 0 && (
            <section className="sp-section-card">
              <h2 className="sp-section-title">Skills</h2>
              <div className="sp-skills">
                {profile.skills.map((skill) => (
                  <span key={skill} className="sp-skill-tag">{skill}</span>
                ))}
              </div>
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

function GraduationIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  )
}

function PortfolioIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
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

export default StudentProfilePage
