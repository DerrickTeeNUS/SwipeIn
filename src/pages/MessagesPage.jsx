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
  setDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import './MessagesPage.css'

const LOCAL_MESSAGES_PREFIX = 'swipein-messages'

function getStoredMessages(conversationId) {
  if (typeof window === 'undefined') return []

  try {
    const saved = window.localStorage.getItem(`${LOCAL_MESSAGES_PREFIX}:${conversationId}`)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

function saveStoredMessages(conversationId, messages) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(`${LOCAL_MESSAGES_PREFIX}:${conversationId}`, JSON.stringify(messages))
  } catch {
    // Ignore storage errors
  }
}

function getMessageTimestamp(value) {
  if (!value) return 0
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return 0
}

function mergeMessages(serverMessages, localMessages) {
  const merged = [...serverMessages, ...localMessages]
  const uniqueMessages = []
  const seen = new Set()

  merged.forEach((message) => {
    const key = message.id || `${message.senderId || 'unknown'}-${message.text || ''}-${getMessageTimestamp(message.createdAt)}`
    if (!seen.has(key)) {
      seen.add(key)
      uniqueMessages.push(message)
    }
  })

  return uniqueMessages.sort((a, b) => getMessageTimestamp(a.createdAt) - getMessageTimestamp(b.createdAt))
}

function MessagesPage() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [storageNotice, setStorageNotice] = useState('')

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

    let isActive = true

    const loadConversations = async () => {
      try {
        const matchesSnap = await getDocs(
          query(collection(db, 'matches'), where('users', 'array-contains', currentUser.uid)),
        )

        const loadedConversations = await Promise.all(
          matchesSnap.docs.map(async (matchDoc) => {
            const matchData = matchDoc.data()
            const partnerUid = matchData.users.find((uid) => uid !== currentUser.uid)

            const [partnerSnap, latestMessagesSnap] = await Promise.all([
              getDoc(doc(db, 'users', partnerUid)).catch(() => ({ exists: () => false })),
              getDocs(
                query(
                  collection(db, 'messages', matchDoc.id, 'messages'),
                  orderBy('createdAt', 'desc'),
                  limit(1),
                ),
              ).catch(() => ({ docs: [] })),
            ])

            const partnerData = partnerSnap.exists ? partnerSnap.data() : {}
            const firestoreMessages = latestMessagesSnap.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }))
            const storedMessages = getStoredMessages(matchDoc.id)
            const latestMessage = [...firestoreMessages, ...storedMessages].sort(
              (a, b) => getMessageTimestamp(b.createdAt) - getMessageTimestamp(a.createdAt),
            )[0] || null

            return {
              id: matchDoc.id,
              partnerUid,
              partnerName: partnerData.displayName || 'Your match',
              partnerRole: partnerData.role || 'student',
              preview: latestMessage?.text || 'Say hello and introduce yourself.',
              updatedAt: latestMessage?.createdAt?.toDate ? latestMessage.createdAt.toDate() : latestMessage?.createdAt instanceof Date ? latestMessage.createdAt : null,
            }
          }),
        )

        if (!isActive) return

        const sortedConversations = loadedConversations.sort((a, b) => {
          const timeA = a.updatedAt?.getTime() || 0
          const timeB = b.updatedAt?.getTime() || 0
          return timeB - timeA
        })

        setConversations(sortedConversations)
      } catch (err) {
        console.error('Conversation load error:', err)
        if (isActive) {
          setConversations([])
          setActiveConversationId('')
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    loadConversations()

    return () => {
      isActive = false
    }
  }, [activeConversationId, currentUser?.uid])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }

    const unsubscribe = onSnapshot(
      query(collection(db, 'messages', activeConversationId, 'messages'), orderBy('createdAt', 'asc')),
      (snapshot) => {
        const firestoreMessages = snapshot.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }))
        const localMessages = getStoredMessages(activeConversationId)
        setMessages(mergeMessages(firestoreMessages, localMessages))
      },
      (err) => {
        console.error('Message stream error:', err)
        const localMessages = getStoredMessages(activeConversationId)
        setMessages(localMessages)
      },
    )

    return () => unsubscribe()
  }, [activeConversationId])

  useEffect(() => {
    setDraft('')
  }, [activeConversation?.id])

  const refreshConversations = async (selectedId = activeConversationId) => {
    if (!currentUser?.uid) return

    try {
      const matchesSnap = await getDocs(
        query(collection(db, 'matches'), where('users', 'array-contains', currentUser.uid)),
      )

      const loadedConversations = await Promise.all(
        matchesSnap.docs.map(async (matchDoc) => {
          const matchData = matchDoc.data()
          const partnerUid = matchData.users.find((uid) => uid !== currentUser.uid)
          const [partnerSnap, latestMessagesSnap] = await Promise.all([
            getDoc(doc(db, 'users', partnerUid)).catch(() => ({ exists: () => false })),
            getDocs(
              query(
                collection(db, 'messages', matchDoc.id, 'messages'),
                orderBy('createdAt', 'desc'),
                limit(1),
              ),
            ).catch(() => ({ docs: [] })),
          ])

          const partnerData = partnerSnap.exists ? partnerSnap.data() : {}
          const firestoreMessages = latestMessagesSnap.docs.map((messageDoc) => ({ id: messageDoc.id, ...messageDoc.data() }))
          const storedMessages = getStoredMessages(matchDoc.id)
          const latestMessage = [...firestoreMessages, ...storedMessages].sort(
            (a, b) => getMessageTimestamp(b.createdAt) - getMessageTimestamp(a.createdAt),
          )[0] || null

          return {
            id: matchDoc.id,
            partnerUid,
            partnerName: partnerData.displayName || 'Your match',
            partnerRole: partnerData.role || 'student',
            preview: latestMessage?.text || 'Say hello and introduce yourself.',
            updatedAt: latestMessage?.createdAt?.toDate ? latestMessage.createdAt.toDate() : latestMessage?.createdAt instanceof Date ? latestMessage.createdAt : null,
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
    } catch (err) {
      console.error('Conversation refresh error:', err)
    }
  }

  const handleSend = async (event) => {
    event.preventDefault()
    if (!draft.trim() || !activeConversationId || !currentUser?.uid || sending) return

    setSending(true)
    setStorageNotice('')

    const messageText = draft.trim()
    const optimisticMessage = {
      id: `local-${Date.now()}`,
      text: messageText,
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'You',
      createdAt: new Date(),
    }

    const storedMessages = mergeMessages(getStoredMessages(activeConversationId), [optimisticMessage])
    saveStoredMessages(activeConversationId, storedMessages)
    setMessages((previousMessages) => mergeMessages(previousMessages, [optimisticMessage]))

    try {
      await addDoc(collection(db, 'messages', activeConversationId, 'messages'), {
        text: messageText,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'You',
        createdAt: serverTimestamp(),
      })

      await setDoc(
        doc(db, 'matches', activeConversationId),
        {
          lastMessage: messageText,
          lastMessageBy: currentUser.uid,
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      setDraft('')
      await refreshConversations(activeConversationId)
    } catch (err) {
      console.error('Message send error:', err)
      setStorageNotice('Your message was saved locally and will appear once the connection is available again.')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (value) => {
    if (!value) return ''
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    }
    if (value instanceof Date) {
      return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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
        <aside className="inbox-list">
          <div className="messages-header">
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

        <section className="messages-card inbox-thread">
          {activeConversation ? (
            <>
              <header className="messages-header">
                <div>
                  <p className="eyebrow">{activeConversation.partnerRole === 'professional' ? 'Professional' : 'Student'}</p>
                  <h2>{activeConversation.partnerName}</h2>
                </div>
                <Link to="/swipe" className="ghost-link">
                  Find more
                </Link>
              </header>

              <div className="message-thread">
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

              <form className="message-form" onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  placeholder="Send a message"
                />
                {storageNotice ? <p className="conversation-preview">{storageNotice}</p> : null}
                <button className="primary-button" type="submit" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-chat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div>
                <h3>Select a conversation</h3>
                <p>Choose a match from the left to open the chat.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default MessagesPage
