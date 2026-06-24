import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import './MessagesPage.css'

function MessagesPage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) || null,
    [activeConversationId, conversations],
  )

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate('/login')
        return
      }

      try {
        const userSnap = await getDoc(doc(db, 'users', firebaseUser.uid))
        const userData = userSnap.exists() ? userSnap.data() : {}
        setCurrentUser({ ...userData, uid: firebaseUser.uid })
      } catch (err) {
        console.error('User load error:', err)
      }
    })

    return () => unsubscribe()
  }, [navigate])

  useEffect(() => {
    if (!currentUser?.uid) return

    const loadConversations = async () => {
      const matchesSnap = await getDocs(
        query(collection(db, 'matches'), where('users', 'array-contains', currentUser.uid)),
      )

      const loadedConversations = await Promise.all(
        matchesSnap.docs.map(async (matchDoc) => {
          const matchData = matchDoc.data()
          const partnerUid = matchData.users.find((uid) => uid !== currentUser.uid)

          const [partnerSnap, latestMessagesSnap] = await Promise.all([
            getDoc(doc(db, 'users', partnerUid)),
            getDocs(
              query(
                collection(db, 'messages', matchDoc.id, 'messages'),
                orderBy('createdAt', 'desc'),
                limit(1),
              ),
            ),
          ])

          const partnerData = partnerSnap.exists() ? partnerSnap.data() : {}
          const latestMessage = latestMessagesSnap.docs[0]?.data() || null

          return {
            id: matchDoc.id,
            partnerUid,
            partnerName: partnerData.displayName || 'Your match',
            partnerRole: partnerData.role || 'student',
            preview: latestMessage?.text || 'Say hello and introduce yourself.',
            updatedAt: latestMessage?.createdAt?.toDate ? latestMessage.createdAt.toDate() : null,
          }
        }),
      )

      const sortedConversations = loadedConversations.sort((a, b) => {
        const timeA = a.updatedAt?.getTime() || 0
        const timeB = b.updatedAt?.getTime() || 0
        return timeB - timeA
      })

      setConversations(sortedConversations)
      if (!activeConversationId && sortedConversations[0]) {
        setActiveConversationId(sortedConversations[0].id)
      }
      setLoading(false)
    }

    loadConversations()
  }, [activeConversationId, currentUser?.uid])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'messages', activeConversationId, 'messages'), orderBy('createdAt', 'asc')),
      (snapshot) => {
        setMessages(snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() })))
      },
    )

    return () => unsubscribe()
  }, [activeConversationId])

  useEffect(() => {
    if (!activeConversation) return

    const firstName = activeConversation.partnerName.split(' ')[0] || 'there'
    setDraft(
      `Hi ${firstName}! I’m ${currentUser?.displayName || 'a SwipeIn member'} and I’d love to introduce myself. I’m excited to connect with you.`,
    )
  }, [activeConversation, currentUser?.displayName])

  const refreshConversations = async (selectedId = activeConversationId) => {
    if (!currentUser?.uid) return

    const matchesSnap = await getDocs(
      query(collection(db, 'matches'), where('users', 'array-contains', currentUser.uid)),
    )

    const loadedConversations = await Promise.all(
      matchesSnap.docs.map(async (matchDoc) => {
        const matchData = matchDoc.data()
        const partnerUid = matchData.users.find((uid) => uid !== currentUser.uid)
        const [partnerSnap, latestMessagesSnap] = await Promise.all([
          getDoc(doc(db, 'users', partnerUid)),
          getDocs(
            query(
              collection(db, 'messages', matchDoc.id, 'messages'),
              orderBy('createdAt', 'desc'),
              limit(1),
            ),
          ),
        ])

        const partnerData = partnerSnap.exists() ? partnerSnap.data() : {}
        const latestMessage = latestMessagesSnap.docs[0]?.data() || null

        return {
          id: matchDoc.id,
          partnerUid,
          partnerName: partnerData.displayName || 'Your match',
          partnerRole: partnerData.role || 'student',
          preview: latestMessage?.text || 'Say hello and introduce yourself.',
          updatedAt: latestMessage?.createdAt?.toDate ? latestMessage.createdAt.toDate() : null,
        }
      }),
    )

    const sortedConversations = loadedConversations.sort((a, b) => {
      const timeA = a.updatedAt?.getTime() || 0
      const timeB = b.updatedAt?.getTime() || 0
      return timeB - timeA
    })

    setConversations(sortedConversations)
    if (selectedId && sortedConversations.some((conversation) => conversation.id === selectedId)) {
      setActiveConversationId(selectedId)
    } else if (sortedConversations[0]) {
      setActiveConversationId(sortedConversations[0].id)
    }
  }

  const handleSend = async (event) => {
    event.preventDefault()
    if (!draft.trim() || !activeConversationId || !currentUser?.uid || sending) return

    setSending(true)
    try {
      await addDoc(collection(db, 'messages', activeConversationId, 'messages'), {
        text: draft.trim(),
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'You',
        createdAt: serverTimestamp(),
      })

      setDraft(`Hi ${activeConversation?.partnerName?.split(' ')[0] || 'there'}! I’m ${currentUser?.displayName || 'a SwipeIn member'} and I’d love to introduce myself. I’m excited to connect with you.`)
      await refreshConversations(activeConversationId)
    } catch (err) {
      console.error('Message send error:', err)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (value) => {
    if (!value) return ''
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
    return ''
  }

  if (loading) {
    return (
      <div className="messages-page">
        <div className="messages-card loading-card">
          <p className="eyebrow">Intro messaging</p>
          <h1>Loading your conversations…</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="messages-page">
      <div className="messages-shell">
        <aside className="conversation-list">
          <div className="list-header">
            <div>
              <p className="eyebrow">Intro messaging</p>
              <h1>Conversations</h1>
            </div>
            <Link to="/home" className="ghost-link">
              Back
            </Link>
          </div>

          {conversations.length === 0 ? (
            <div className="empty-state">
              <h2>No conversations yet</h2>
              <p>Swipe to create a match, then open a friendly intro.</p>
              <Link to="/swipe" className="primary-button message-button">
                Start swiping
              </Link>
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-item${conversation.id === activeConversationId ? ' active' : ''}`}
                onClick={() => setActiveConversationId(conversation.id)}
                type="button"
              >
                <div className="conversation-meta">
                  <span className="conversation-name">{conversation.partnerName}</span>
                  <span className="conversation-role">{conversation.partnerRole === 'professional' ? 'Recruiter' : 'Student'}</span>
                </div>
                <p className="conversation-preview">{conversation.preview}</p>
              </button>
            ))
          )}
        </aside>

        <section className="conversation-panel">
          {activeConversation ? (
            <>
              <header className="panel-header">
                <div>
                  <p className="eyebrow">{activeConversation.partnerRole === 'professional' ? 'Professional' : 'Student'}</p>
                  <h2>{activeConversation.partnerName}</h2>
                </div>
                <Link to="/swipe" className="ghost-link">
                  Find more
                </Link>
              </header>

              <div className="message-list">
                {messages.length === 0 ? (
                  <div className="empty-chat">
                    <h3>Start with a friendly intro</h3>
                    <p>Share a short note and make your first connection feel warm and personal.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isMine = message.senderId === currentUser?.uid
                    return (
                      <div key={message.id} className={`message-row${isMine ? ' mine' : ''}`}>
                        <div className={`message-bubble${isMine ? ' mine' : ''}`}>
                          <p>{message.text}</p>
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <form className="composer" onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  placeholder="Write your intro message"
                />
                <button className="primary-button" type="submit" disabled={sending}>
                  {sending ? 'Sending…' : 'Send intro'}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-chat">
              <h3>No match selected</h3>
              <p>Choose a conversation from the left to begin your intro.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default MessagesPage
