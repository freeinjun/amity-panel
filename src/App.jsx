import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './lib/supabase'
import ClientList from './components/ClientList'
import Chat from './components/Chat'
import AiPanel from './components/AiPanel'
import './App.css'

export default function App() {
  const [clients, setClients] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [titleFlash, setTitleFlash] = useState(false)
  const [unreadIds, setUnreadIds] = useState(new Set())
  const [showAiPanel, setShowAiPanel] = useState(false)
  const flashInterval = useRef(null)

  useEffect(() => {
    if (titleFlash) {
      let on = true
      flashInterval.current = setInterval(() => {
        document.title = on ? '💬 Новое сообщение!' : 'AMITY — Panel'
        on = !on
      }, 1000)
    } else {
      clearInterval(flashInterval.current)
      document.title = 'AMITY — Panel'
    }
    return () => clearInterval(flashInterval.current)
  }, [titleFlash])

  useEffect(() => {
    const handleFocus = () => setTitleFlash(false)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  const loadClients = useCallback(async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('last_message_at', { ascending: false })
    if (error) { console.error('Error loading clients:', error); return }

    const withLastMsg = await Promise.all(
      data.map(async (client) => {
        const { data: msgs } = await supabase
          .from('conversations')
          .select('message_text, message_text_ru')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
        const last = msgs?.[0]
        return { ...client, _lastMessage: last?.message_text_ru || last?.message_text || '' }
      })
    )
    setClients(withLastMsg)
    setLoading(false)
  }, [])

  const loadMessages = useCallback(async () => {
    if (!selectedId) return
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('client_id', selectedId)
      .order('created_at', { ascending: true })
    if (error) { console.error('Error loading messages:', error); return }
    setMessages(data || [])
  }, [selectedId])

  const handleSelectClient = useCallback((id) => {
    setSelectedId(id)
    setUnreadIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  useEffect(() => { loadClients() }, [loadClients])
  useEffect(() => { loadMessages() }, [loadMessages])

  useEffect(() => {
    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations' },
        (payload) => {
          const newMsg = payload.new
          if (newMsg.direction === 'in') {
            setTitleFlash(true)
            if (newMsg.client_id !== selectedId) {
              setUnreadIds(prev => new Set(prev).add(newMsg.client_id))
            }
          }
          loadMessages()
          loadClients()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedId, loadClients, loadMessages])

  useEffect(() => {
    const channel = supabase
      .channel('clients-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clients' },
        () => { loadClients() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadClients])

  const selectedClient = clients.find(c => c.id === selectedId) || null
  const totalClients = clients.length
  const activeCampaigns = clients.filter(c => ['CAMPAIGN_ACTIVE', 'SUBSCRIBED'].includes(c.current_state)).length
  const pendingPayment = clients.filter(c => c.current_state === 'PAYMENT_PENDING').length

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">AMITY</div>
        <div className="loading-text">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="header-logo">AMITY</span>
          <span className="header-sub">Panel de Control</span>
        </div>
        <div className="header-badges">
          <span className="badge-stat">{totalClients} clientes</span>
          <span className="badge-green">{activeCampaigns} activas</span>
          {pendingPayment > 0 && (
            <span className="badge-red">{pendingPayment} pago pendiente</span>
          )}
          <button className={`btn-ai-panel ${showAiPanel ? 'active' : ''}`}
            onClick={() => setShowAiPanel(!showAiPanel)}>
            🧠 AI
          </button>
        </div>
      </header>
      <div className="main">
        <ClientList clients={clients} selectedId={selectedId} onSelect={handleSelectClient} unreadIds={unreadIds} />
        <Chat client={selectedClient} messages={messages} onMessageSent={() => {}} />
        {showAiPanel && (
          <AiPanel client={selectedClient} messages={messages} onClose={() => setShowAiPanel(false)} />
        )}
      </div>
    </div>
  )
}
