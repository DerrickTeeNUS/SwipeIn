import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import './MessagesPage.css'

function MessagesPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login')
        return
      }

      setUser(firebaseUser)
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid))
        const role = snap.exists() ? snap.data().role || '' : ''
        setUserRole(role)
      } catch {
        setUserRole('')
      }
    })

    return () => unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (!user?.uid) return

    const storageKey = `swipein-messages-${user.uid}`
    const saved = window.localStorage.getItem(storageKey)

    if (saved) {
      setMessages(JSON.parse(saved))
    } else {
      const starterMessages = userRole === 'professional'
        ? [
            {
              id: 'welcome-professional',
              sender: 'them',
              text: 'Hi! I’m excited to connect with you about the internship opportunity.',
              createdAt: new Date().toISOString(),
            },
          ]
        : [
            {
              id: 'welcome-student',
              sender: 'them',
              text: 'Hi! I’m Maya from the recruiting team. I’d love to hear more about your interest.',
              createdAt: new Date().toISOString(),
            },
          ]

      setMessages(starterMessages)
      window.localStorage.setItem(storageKey, JSON.stringify(starterMessages))
    }

    setLoading(false)
  }, [user, userRole])

  const partnerLabel = useMemo(() => {
    if (userRole === 'professional') return 'your intern'
    return 'your hirer'
  }, [userRole])

  const handleSend = (event) => {
    event.preventDefault()
    if (!draft.trim()) return

    const nextMessages = [
      ...messages,
      {
        id: `${Date.now()}`,
        sender: 'me',
        text: draft.trim(),
        createdAt: new Date().toISOString(),
      },
    ]

    setMessages(nextMessages)
    window.localStorage.setItem(`swipein-messages-${user.uid}`, JSON.stringify(nextMessages))
    setDraft('')
  }

  if (loading) {
    return (
      <div className="messages-page">
        <div className="messages-card">
          <p className="eyebrow">Intro messaging</p>
          <h1>Loading your conversation…</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="messages-page">
      <div className="messages-shell">
        <div className="messages-card">
          <div className="messages-header">
            <div>
              <p className="eyebrow">Intro messaging</p>
              <h1>Message {partnerLabel}</h1>
              <p className="messages-subtitle">Send a warm first message and keep the conversation moving.</p>
            </div>
            <button type="button" className="back-button" onClick={() => navigate('/home')}>
              ← Back
            </button>
          </div>

          <div className="message-thread">
            {messages.map((message) => (
              <div key={message.id} className={`message-bubble ${message.sender === 'me' ? 'mine' : 'theirs'}`}>
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className="message-suggestions">
            <button type="button" onClick={() => setDraft('Hi! I’m excited to connect with you and learn more about the opportunity.')}>Quick intro</button>
            <button type="button" onClick={() => setDraft('Thanks for reaching out. I’d love to share more about my background and interests.')}>Share background</button>
          </div>

          <form className="message-form" onSubmit={handleSend}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={userRole === 'professional' ? 'Write a friendly intro to your intern' : 'Write a friendly intro to your hirer'}
              rows={4}
            />
            <button type="submit" className="primary-button">Send message</button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default MessagesPage
