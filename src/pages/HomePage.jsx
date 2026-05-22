import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase'

function HomePage() {
  const [user, setUser] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login')
      } else {
        setUser(firebaseUser)
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
        <button className="secondary-button" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

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
