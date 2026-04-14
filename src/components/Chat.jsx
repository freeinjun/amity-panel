import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATES } from '../lib/constants'

export default function Chat({ client, messages, onMessageSent }) {
  const [showRu, setShowRu] = useState(true)
  const [inputText, setInputText] = useState('')
  const [preview, setPreview] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState('translate') // 'translate' or 'ai'
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!client) {
    return (
      <div className="panel-center">
        <div className="empty-msg" style={{ marginTop: '40%' }}>
          ← Выбери клиента из списка
        </div>
      </div>
    )
  }

  const state = STATES[client.current_state] || STATES.NEW

  const togglePause = async () => {
    await supabase
      .from('clients')
      .update({ is_paused: !client.is_paused })
      .eq('id', client.id)
  }

  // Simple translate: Russian → Spanish
  const handleTranslate = async () => {
    const text = inputText.trim()
    if (!text) return
    setTranslating(true)
    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { text, from: 'ru', to: 'es' }
      })
      if (error) throw error
      setPreview({ ru: text, es: data.translated })
      setInputText('')
    } catch (err) {
      console.error('Translation error:', err)
      setPreview({ ru: text, es: text })
      setInputText('')
    }
    setTranslating(false)
  }

  // AI reply: instruction in Russian → Claude writes Spanish message
  const handleAiReply = async () => {
    const text = inputText.trim()
    if (!text) return
    setTranslating(true)
    try {
      const lastMessages = messages.slice(-10).map(m => ({
        role: m.direction === 'in' ? 'client' : 'assistant',
        text: m.message_text
      }))
      const { data, error } = await supabase.functions.invoke('ai-reply', {
        body: {
          messages: lastMessages,
          clientName: client.sender_name,
          instruction: text
        }
      })
      if (error) throw error
      setPreview({ ru: data.ru || text, es: data.es })
      setInputText('')
    } catch (err) {
      console.error('AI reply error:', err)
      alert('Ошибка AI: ' + err.message)
    }
    setTranslating(false)
  }

  const handleSend = async () => {
    if (!preview) return
    setSending(true)
    try {
      const { error: sendError } = await supabase.functions.invoke('send-whatsapp', {
        body: { phone: client.phone_number, message: preview.es }
      })
      if (sendError) console.error('Send error:', sendError)

      await supabase.from('conversations').insert({
        client_id: client.id,
        direction: 'out',
        message_text: preview.es,
        message_text_ru: preview.ru,
        sender: 'denis',
        bot_type: 'denis',
        state_at_time: client.current_state,
      })

      await supabase
        .from('clients')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', client.id)

      setPreview(null)
      if (onMessageSent) onMessageSent()
    } catch (err) {
      console.error('Send error:', err)
      alert('Ошибка отправки: ' + err.message)
    }
    setSending(false)
  }

  const msgTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (preview) {
        handleSend()
      } else if (mode === 'ai') {
        handleAiReply()
      } else {
        handleTranslate()
      }
    }
  }

  return (
    <div className="panel-center">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-name">{client.sender_name}</span>
          <span className="state-badge" style={{
            color: state.color, background: state.bg, border: `1px solid ${state.color}33`
          }}>
            {state.label}
          </span>
        </div>
        <div className="chat-btns">
          <button className={`chat-btn ${showRu ? 'active' : ''}`} onClick={() => setShowRu(!showRu)}>
            🇷🇺 RU {showRu ? 'вкл' : 'выкл'}
          </button>
          <button className={`chat-btn ${client.is_paused ? 'paused' : ''}`} onClick={togglePause}>
            {client.is_paused ? '⏸ Bot paused' : '▶ Bot active'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages">
        {messages.length === 0 && <div className="empty-msg">Переписка пуста</div>}
        {messages.map(m => (
          <div key={m.id} className={`msg-row ${m.direction}`}>
            <div className={`msg-bubble ${m.direction}`}>
              {m.direction === 'out' && (
                <div className="msg-from">
                  {m.sender === 'bot' || m.sender === 'jane' ? '🤖 Jane' : '👤 Denis'}
                </div>
              )}
              <div className="msg-text">{m.message_text}</div>
              {showRu && m.message_text_ru && (
                <div className={`msg-translation ${m.direction}`}>{m.message_text_ru}</div>
              )}
              <div className="msg-time">{msgTime(m.created_at)}</div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Preview */}
      {preview && (
        <div className="preview-area">
          <div className="preview-ru">
            <div className="preview-label">Оригинал (RU)</div>
            <div className="preview-text">{preview.ru}</div>
          </div>
          <div className="preview-es">
            <div className="preview-label">Перевод (ES) — можно редактировать</div>
            <textarea
              className="preview-edit"
              value={preview.es}
              onChange={e => setPreview({ ...preview, es: e.target.value })}
              rows={3}
            />
          </div>
          <div className="preview-btns">
            <button className="btn-cancel" onClick={() => setPreview(null)}>✕ Отмена</button>
            <button className="btn-send" onClick={handleSend} disabled={sending}>
              {sending ? '⏳ Отправка...' : '✉ Отправить'}
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      {!preview && (
        <div className="chat-input">
          <div className="chat-input-hint">
            {mode === 'ai'
              ? '🤖 Напиши инструкцию на русском → Claude сам напишет ответ клиенту'
              : 'Пиши на русском → клиент получит на испанском'}
          </div>
          <div className="chat-input-row">
            <textarea
              className="chat-input-field"
              placeholder={mode === 'ai'
                ? 'Скажи ему что можем начать завтра, спроси удобное время...'
                : 'Напиши сообщение...'}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button
              className={`btn-mode ${mode === 'ai' ? 'active' : ''}`}
              onClick={() => setMode(mode === 'ai' ? 'translate' : 'ai')}
              title={mode === 'ai' ? 'Режим: AI ответ' : 'Режим: Перевод'}
            >
              {mode === 'ai' ? '🤖' : '📝'}
            </button>
            <button
              className="btn-translate"
              onClick={mode === 'ai' ? handleAiReply : handleTranslate}
              disabled={!inputText.trim() || translating}
            >
              {translating ? '⏳' : mode === 'ai' ? '🤖 AI →' : '→ ES'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
