import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { auth, db, storage } from '../firebase'
import './ProfilePage.css'

function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [userRole, setUserRole] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [uid, setUid] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [existingPhotoURL, setExistingPhotoURL] = useState('')
  const [skillInput, setSkillInput] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    bio: '',
    location: '',
    about: '',
    skills: [],
    university: '',
    major: '',
    gradYear: '',
    portfolioURL: '',
    linkedinURL: '',
    company: '',
    jobTitle: '',
    industry: '',
    lookingFor: '',
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate('/login')
        return
      }
      setDisplayName(user.displayName || '')
      setUid(user.uid)

      try {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists()) {
          const data = snap.data()
          setUserRole(data.role || '')
          setExistingPhotoURL(data.photoURL || '')
          if (data.photoURL) setPhotoPreview(data.photoURL)
          setForm((prev) => ({
            ...prev,
            bio: data.bio || '',
            location: data.location || '',
            about: data.about || '',
            skills: data.skills || [],
            university: data.university || '',
            major: data.major || '',
            gradYear: data.gradYear || '',
            portfolioURL: data.portfolioURL || '',
            linkedinURL: data.linkedinURL || '',
            company: data.company || '',
            jobTitle: data.jobTitle || '',
            industry: data.industry || '',
            lookingFor: data.lookingFor || '',
          }))
        }
      } catch {
        // Firestore read failed — continue with empty form
      }
      setLoading(false)
    })
    return unsub
  }, [navigate])

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handlePhotoSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function handleSkillKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && skillInput.trim()) {
      e.preventDefault()
      const newSkill = skillInput.trim().replace(/,+$/, '')
      if (newSkill && !form.skills.includes(newSkill)) {
        setForm((prev) => ({ ...prev, skills: [...prev.skills, newSkill] }))
      }
      setSkillInput('')
    }
  }

  function removeSkill(skill) {
    setForm((prev) => ({ ...prev, skills: prev.skills.filter((s) => s !== skill) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      let photoURL = existingPhotoURL

      if (photoFile) {
        const storageRef = ref(storage, `profile-photos/${uid}`)
        await uploadBytes(storageRef, photoFile)
        photoURL = await getDownloadURL(storageRef)
      }

      await setDoc(
        doc(db, 'users', uid),
        { ...form, photoURL, profileComplete: true, updatedAt: serverTimestamp() },
        { merge: true }
      )

      navigate('/home')
    } catch {
      setError('Failed to save profile. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">Loading…</div>
      </div>
    )
  }

  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const currentYear = new Date().getFullYear()
  const gradYears = Array.from({ length: 7 }, (_, i) => currentYear + i)

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-card-header">
          <h1>Set up your profile</h1>
          <p>Help the SwipeIn community get to know you</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Avatar */}
          <div className="avatar-section">
            <button
              type="button"
              className="avatar-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Upload profile photo"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Profile preview" className="avatar-img" />
              ) : (
                <span className="avatar-initials">{initials}</span>
              )}
              <span className="avatar-overlay">
                <CameraIcon />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
            />
            <p className="avatar-hint">Click to upload a photo</p>
          </div>

          {/* Headline */}
          <div className="form-group">
            <label htmlFor="bio">Headline</label>
            <input
              id="bio"
              name="bio"
              type="text"
              value={form.bio}
              onChange={handleChange}
              placeholder={
                userRole === 'student'
                  ? 'CS Student at NYU · Seeking summer internships'
                  : 'Senior Engineer at Acme · Looking to mentor the next gen'
              }
              maxLength={120}
            />
          </div>

          {/* Location */}
          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              name="location"
              type="text"
              value={form.location}
              onChange={handleChange}
              placeholder="New York, NY"
            />
          </div>

          {/* About */}
          <div className="form-group">
            <label htmlFor="about">About you</label>
            <textarea
              id="about"
              name="about"
              value={form.about}
              onChange={handleChange}
              placeholder="Tell us about your interests, experience, and what you're looking for…"
              rows={4}
            />
          </div>

          {/* Student-specific */}
          {userRole === 'student' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="university">University</label>
                  <input
                    id="university"
                    name="university"
                    type="text"
                    value={form.university}
                    onChange={handleChange}
                    placeholder="New York University"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="major">Major</label>
                  <input
                    id="major"
                    name="major"
                    type="text"
                    value={form.major}
                    onChange={handleChange}
                    placeholder="Computer Science"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="gradYear">Graduation year</label>
                <div className="select-wrapper">
                  <select
                    id="gradYear"
                    name="gradYear"
                    value={form.gradYear}
                    onChange={handleChange}
                  >
                    <option value="">Select year</option>
                    {gradYears.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <span className="select-chevron"><ChevronIcon /></span>
                </div>
              </div>

              <div className="form-group">
                <label>Skills</label>
                <div className="skills-container">
                  {form.skills.map((skill) => (
                    <span key={skill} className="skill-tag">
                      {skill}
                      <button
                        type="button"
                        className="skill-remove"
                        onClick={() => removeSkill(skill)}
                        aria-label={`Remove ${skill}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    className="skills-inline-input"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={handleSkillKeyDown}
                    placeholder={form.skills.length === 0 ? 'e.g. React, Python, Figma…' : ''}
                  />
                </div>
                <p className="field-hint">Press Enter or comma after each skill</p>
              </div>

              <div className="form-group">
                <label htmlFor="portfolioURL">
                  Portfolio / GitHub <span className="optional-label">(optional)</span>
                </label>
                <input
                  id="portfolioURL"
                  name="portfolioURL"
                  type="url"
                  value={form.portfolioURL}
                  onChange={handleChange}
                  placeholder="https://github.com/yourname"
                />
              </div>
            </>
          )}

          {/* Professional-specific */}
          {userRole === 'professional' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company">Company</label>
                  <input
                    id="company"
                    name="company"
                    type="text"
                    value={form.company}
                    onChange={handleChange}
                    placeholder="Acme Inc."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="jobTitle">Job title</label>
                  <input
                    id="jobTitle"
                    name="jobTitle"
                    type="text"
                    value={form.jobTitle}
                    onChange={handleChange}
                    placeholder="Senior Engineer"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="industry">Industry</label>
                <div className="select-wrapper">
                  <select
                    id="industry"
                    name="industry"
                    value={form.industry}
                    onChange={handleChange}
                  >
                    <option value="">Select industry</option>
                    <option value="technology">Technology</option>
                    <option value="finance">Finance</option>
                    <option value="healthcare">Healthcare</option>
                    <option value="consulting">Consulting</option>
                    <option value="media">Media & Entertainment</option>
                    <option value="retail">Retail & E-commerce</option>
                    <option value="education">Education</option>
                    <option value="government">Government & Nonprofit</option>
                    <option value="other">Other</option>
                  </select>
                  <span className="select-chevron"><ChevronIcon /></span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="lookingFor">What are you looking for in an intern?</label>
                <textarea
                  id="lookingFor"
                  name="lookingFor"
                  value={form.lookingFor}
                  onChange={handleChange}
                  placeholder="Describe the skills, qualities, or background you'd love to see…"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* LinkedIn — common */}
          <div className="form-group">
            <label htmlFor="linkedinURL">
              LinkedIn <span className="optional-label">(optional)</span>
            </label>
            <input
              id="linkedinURL"
              name="linkedinURL"
              type="url"
              value={form.linkedinURL}
              onChange={handleChange}
              placeholder="https://linkedin.com/in/yourname"
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? 'Saving…' : 'Complete profile'}
          </button>

          <button type="button" className="skip-btn" onClick={() => navigate('/home')}>
            Skip for now
          </button>
        </form>
      </div>
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
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

export default ProfilePage
