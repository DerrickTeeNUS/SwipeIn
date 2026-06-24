import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

function HomePage() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login')
      } else {
        setUser(firebaseUser)
        try {
          const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
          if (snap.exists()) setUserRole(snap.data().role || '')
        } catch {
          // role stays empty
        }
      }
    })

    return () => unsubscribe()
  }, [navigate])

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
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            to={userRole === 'professional' ? `/professional/${user?.uid}` : `/student/${user?.uid}`}
            className="secondary-button"
            style={{ textDecoration: 'none' }}
          >
            View profile
          </Link>
          <Link to="/profile" className="secondary-button" style={{ textDecoration: 'none' }}>
            Edit profile
          </Link>
          <button className="secondary-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto 24px' }}>
        <Link
          to="/swipe"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 28px',
            borderRadius: 20,
            background: 'linear-gradient(135deg, #6d4bff 0%, #aa3bff 100%)',
            color: '#fff',
            textDecoration: 'none',
            boxShadow: '0 8px 30px rgba(109,75,255,0.3)',
          }}
        >
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: '1.1rem' }}>Start swiping</p>
            <p style={{ margin: 0, opacity: 0.85, fontSize: '0.9rem' }}>Find your next internship match</p>
          </div>
          <span style={{ fontSize: 28 }}>→</span>
        </Link>
      </div>

      <section className="home-grid">
        <article className="home-card">
          <h2>Find your best fit</h2>
          <p>Browse curated internship suggestions that match your skills, interests, and career goals.</p>
        </article>
        <article className="home-card">
          <h2>Connect with companies</h2>
          <p>Message hirers quickly and let your profile do the talking for you.</p>
        </article>
        <article className="home-card">
          <h2>Track your applications</h2>
          <p>Keep every opportunity, update, and next step in one organized place.</p>
        </article>
        <article className="home-card">
          <h2>Showcase your profile</h2>
          <p>Highlight your education, projects, and why you're the right intern for the team.</p>
        </article>
      </section>
    </main>
  )
}

export default HomePage
