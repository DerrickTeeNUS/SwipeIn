import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/home')
    } catch (err) {
      const message = err?.message || 'Unable to sign in. Please try again.'
      setError(message)
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div className="hero-copy">
          <span className="brand-pill">SwipeIn</span>
          <p className="eyebrow">Your internship network</p>
          <h1>Welcome back</h1>
          <p className="hero-text">
            Log in to connect with students and hirers, discover internships, and build meaningful career relationships.
          </p>
        </div>

        <section className="login-card">
          <div className="login-card-head">
            <h2>Sign in</h2>
            <p>Use your account to continue on SwipeIn.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error && <p className="error-text">{error}</p>}

            <button className="primary-button" type="submit">
              Log in
            </button>
          </form>

          <p className="signup-note">
            New to SwipeIn? <a href="/signup">Create an account</a>
          </p>
        </section>
      </section>
    </main>
  )
}

export default LoginPage
