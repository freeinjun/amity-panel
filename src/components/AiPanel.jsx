import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function AiPanel({ client, messages, onClose }) {
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  // Reset chat when client changes
  useEffect(() => {
    setChat([])
  }, [client?.id])

  const handleAsk = async () => {
    const q = question.trim()
    if (!q || !client) return

    setChat(prev => [...prev, { role: 'user', text: q }])
    setQuestion('')
    setLoading(true)

    try {
      const lastMessages = messages.slice(-20).map(m => ({
        role: m.direction === 'in' ? 'client' : 'assistant',
        text: m.message_text
      }))

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          messages: lastMessages,
          clientName: client.sender_name,
          question: q
        }
      })

      if (error) throw error
      setChat(prev => [...prev, { role: 'ai', text: data.answer }])
    } catch (err) {
      setChat(prev => [...prev, { role: 'ai', text: 'Ошибка: ' + err.message }])
    }
    setLoading(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAsk()
    }
  }

  const quickActions = [
    { label: '📋 Резюме чата', q: 'Сделай краткое резюме этого чата — что обсуждали, на чём остановились, какой следующий шаг' },
    { label: '🎯 Следующий шаг', q: 'Что мне сейчас лучше сделать с этим клиентом? Какой следующий шаг?' },
    { label: '⚡ Настрой клиента', q: 'Опиши настрой клиента — заинтересован, сомневается, готов платить? Коротко.' },
    { label: '💡 Идеи', q: 'Предложи 3 идеи что можно предложить этому клиенту чтобы продвинуть сделку' },
  ]

  if (!client) return null

  return (
    <div className="panel-right-ai">
      <div className="ai-panel-header">
        <span className="ai-panel-title">🧠 AI Помощник</span>
        <button className="ai-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="ai-quick-actions">
        {quickActions.map((a, i) => (
          <button key={i} className="ai-quick-btn" onClick={() => {
            setQuestion(a.q)
            setTimeout(() => {
              setChat(prev => [...prev, { role: 'user', text: a.q }])
              setQuestion('')
              setLoading(true)
              const lastMessages = messages.slice(-20).map(m => ({
                role: m.direction === 'in' ? 'client' : 'assistant',
                text: m.message_text
              }))
              supabase.functions.invoke('ai-assistant', {
                body: { messages: lastMessages, clientName: client.sender_name, question: a.q }
              }).then(({ data, error }) => {
                if (error) setChat(prev => [...prev, { role: 'ai', text: 'Ошибка' }])
                else setChat(prev => [...prev, { role: 'ai', text: data.answer }])
                setLoading(false)
              })
            }, 0)
          }}>{a.label}</button>
        ))}
      </div>

      <div className="ai-chat">
        {chat.length === 0 && (
          <div className="ai-empty">Спроси что-нибудь о клиенте {client.sender_name} или нажми быструю кнопку</div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`ai-msg ${m.role}`}>
            <div className="ai-msg-text">{m.text}</div>
          </div>
        ))}
        {loading && <div className="ai-msg ai"><div className="ai-msg-text">⏳ Думаю...</div></div>}
        <div ref={bottomRef} />
      </div>

      <div className="ai-input-area">
        <textarea
          className="ai-input"
          placeholder="Спроси про клиента..."
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
        />
        <button className="ai-send" onClick={handleAsk} disabled={!question.trim() || loading}>
          →
        </button>
      </div>
    </div>
  )
}
