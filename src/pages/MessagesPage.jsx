import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { doc, getDoc } from 'firebase/firestore'
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
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState('')
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState('')
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
        if (!activeConversationId && sortedConversations[0]) {
          setActiveConversationId(sortedConversations[0].id)
        }
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
    if (!activeConversation) {
      setDraft('')
      return
    }

    setDraft('')
  }, [activeConversation?.id])

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
                  placeholder="Send a message"
                />
                {storageNotice ? <p className="conversation-preview">{storageNotice}</p> : null}
                <button className="primary-button" type="submit" disabled={sending}>
                  {sending ? 'Sending…' : 'Send message'}
                </button>
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
