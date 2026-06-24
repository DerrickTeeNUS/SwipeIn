import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import './MessagesPage.css'

function MessagesPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState('')
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

    const storageKey = `swipein-inbox-${user.uid}`
    const savedInbox = window.localStorage.getItem(storageKey)

    if (savedInbox) {
      const parsed = JSON.parse(savedInbox)
      setConversations(parsed)
      if (parsed[0]) setActiveConversationId(parsed[0].id)
    } else {
      const starterConversations = [
        {
          id: 'match-1',
          name: userRole === 'professional' ? 'Ava Chen' : 'Maya Patel',
          role: userRole === 'professional' ? 'Intern' : 'Hirer',
          messages: [
            {
              id: 'msg-1',
              sender: 'them',
              text: userRole === 'professional'
                ? 'Hi! I’m really excited about the opportunity and would love to connect.'
                : 'Hi! I’m interested in learning more about your team and the internship role.',
            },
          ],
        },
      ]

      setConversations(starterConversations)
      setActiveConversationId(starterConversations[0].id)
      window.localStorage.setItem(storageKey, JSON.stringify(starterConversations))
    }

    setLoading(false)
  }, [user?.uid, userRole])

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  )

  const handleSend = (event) => {
    event.preventDefault()
    if (!draft.trim() || !activeConversation || !user?.uid) return

    const nextConversations = conversations.map((conversation) => {
      if (conversation.id !== activeConversation.id) return conversation

      return {
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: `${Date.now()}`,
            sender: 'me',
            text: draft.trim(),
          },
        ],
      }
    })

    setConversations(nextConversations)
    window.localStorage.setItem(`swipein-inbox-${user.uid}`, JSON.stringify(nextConversations))
    setDraft('')
  }

  if (loading) {
    return (
      <div className="messages-page">
        <div className="messages-card">
          <p className="eyebrow">Inbox</p>
          <h1>Loading your messages…</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="messages-page">
      <div className="messages-shell">
        <aside className="inbox-list">
          <div className="messages-header">
            <div>
              <p className="eyebrow">Inbox</p>
              <h1>Messages</h1>
            </div>
            <button type="button" className="back-button" onClick={() => navigate('/home')}>
              ← Back
            </button>
          </div>

          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              className={`conversation-item${conversation.id === activeConversationId ? ' active' : ''}`}
              onClick={() => setActiveConversationId(conversation.id)}
            >
              <strong>{conversation.name}</strong>
              <span>{conversation.role}</span>
              <p>{conversation.messages[conversation.messages.length - 1]?.text}</p>
            </button>
          ))}
        </aside>

        <section className="messages-card inbox-thread">
          {activeConversation ? (
            <>
              <div className="messages-header">
                <div>
                  <p className="eyebrow">Matched conversation</p>
                  <h2>{activeConversation.name}</h2>
                </div>
              </div>

              <div className="message-thread">
                {activeConversation.messages.map((message) => (
                  <div key={message.id} className={`message-bubble ${message.sender === 'me' ? 'mine' : 'theirs'}`}>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>

              <form className="message-form" onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Write a message to start or continue the conversation"
                  rows={4}
                />
                <button type="submit" className="primary-button">Send message</button>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <h2>No conversations yet</h2>
              <p>Once you match with someone, they’ll appear here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default MessagesPage
