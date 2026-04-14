import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { STATES } from '../lib/constants'

export default function Chat({ client, messages, onMessageSent }) {
  const [showRu, setShowRu] = useState(true)
  const [inputText, setInputText] = useState('')
  const [preview, setPreview] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState('translate')
  const [transcribing, setTranscribing] = useState({})
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!client) {
    return (
      <div className="panel-center">
        <div className="empty-msg" style={{ marginTop: '40%' }}>← Выбери клиента из списка</div>
      </div>
    )
  }

  const state = STATES[client.current_state] || STATES.NEW

  const togglePause = async () => {
    await supabase.from('clients').update({ is_paused: !client.is_paused }).eq('id', client.id)
  }

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
      setPreview({ ru: text, es: text })
      setInputText('')
    }
    setTranslating(false)
  }

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
        body: { messages: lastMessages, clientName: client.sender_name, instruction: text }
      })
      if (error) throw error
      setPreview({ ru: data.ru || text, es: data.es })
      setInputText('')
    } catch (err) {
      alert('Ошибка AI: ' + err.message)
    }
    setTranslating(false)
  }

  const handleSend = async () => {
    if (!preview) return
    setSending(true)
    try {
      await supabase.functions.invoke('send-whatsapp', {
        body: { phone: client.phone_number, message: preview.es }
      })
      await supabase.from('conversations').insert({
        client_id: client.id, direction: 'out', message_text: preview.es,
        message_text_ru: preview.ru, sender: 'denis', bot_type: 'denis',
        state_at_time: client.current_state,
      })
      await supabase.from('clients')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', client.id)
      setPreview(null)
      if (onMessageSent) onMessageSent()
    } catch (err) {
      alert('Ошибка отправки: ' + err.message)
    }
    setSending(false)
  }

  // Transcribe audio message
  const handleTranscribe = async (msg) => {
    setTranscribing(prev => ({ ...prev, [msg.id]: true }))
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { messageId: msg.id, mediaUrl: msg.media_url }
      })
      if (error) throw error
      // Update local message data (realtime will also catch it)
      msg.audio_transcription = data.transcription
      msg.audio_transcription_ru = data.transcriptionRu
    } catch (err) {
      console.error('Transcribe error:', err)
      alert('Ошибка расшифровки: ' + err.message)
    }
    setTranscribing(prev => ({ ...prev, [msg.id]: false }))
  }

  const msgTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (preview) handleSend()
      else if (mode === 'ai') handleAiReply()
      else handleTranslate()
    }
  }

  // Render a single message
  const renderMessage = (m) => {
    const isAudio = m.media_type === 'audio'
    const isImage = m.media_type === 'image'

    return (
      <div key={m.id} className={`msg-row ${m.direction}`}>
        <div className={`msg-bubble ${m.direction}`}>
          {m.direction === 'out' && (
            <div className="msg-from">
              {m.sender === 'bot' || m.sender === 'jane' ? '🤖 Jane' : '👤 Denis'}
            </div>
          )}

          {/* Audio message */}
          {isAudio && (
            <div className="msg-audio">
              <div className="audio-label">🎤 Голосовое сообщение</div>
              {m.media_url && (
                <audio controls preload="none" className="audio-player">
                  <source src={m.media_url} />
                </audio>
              )}
              {m.audio_transcription ? (
                <div className="audio-transcription">
                  <div className="audio-text-es">{m.audio_transcription}</div>
                  {showRu && m.audio_transcription_ru && (
                    <div className="audio-text-ru">{m.audio_transcription_ru}</div>
                  )}
                </div>
              ) : (
                <button
                  className="btn-transcribe"
                  onClick={() => handleTranscribe(m)}
                  disabled={transcribing[m.id]}
                >
                  {transcribing[m.id] ? '⏳ Расшифровка...' : '🎤 Расшифровать'}
                </button>
              )}
            </div>
          )}

          {/* Image message */}
          {isImage && m.media_url && (
            <div className="msg-image">
              <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                <img src={m.media_url} alt="" className="msg-img-preview" />
              </a>
            </div>
          )}

          {/* Text */}
          {m.message_text && <div className="msg-text">{m.message_text}</div>}

          {/* Translation */}
          {showRu && m.message_text_ru && !isAudio && (
            <div className={`msg-translation ${m.direction}`}>{m.message_text_ru}</div>
          )}

          <div className="msg-time">{msgTime(m.created_at)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="panel-center">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-name">{client.sender_name}</span>
          <span className="state-badge" style={{
            color: state.color, background: state.bg, border: `1px solid ${state.color}33`
          }}>{state.label}</span>
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

      <div className="messages">
        {messages.length === 0 && <div className="empty-msg">Переписка пуста</div>}
        {messages.map(renderMessage)}
        <div ref={messagesEndRef} />
      </div>

      {preview && (
        <div className="preview-area">
          <div className="preview-ru">
            <div className="preview-label">Оригинал (RU)</div>
            <div className="preview-text">{preview.ru}</div>
          </div>
          <div className="preview-es">
            <div className="preview-label">Перевод (ES) — можно редактировать</div>
            <textarea className="preview-edit" value={preview.es}
              onChange={e => setPreview({ ...preview, es: e.target.value })} rows={3} />
          </div>
          <div className="preview-btns">
            <button className="btn-cancel" onClick={() => setPreview(null)}>✕ Отмена</button>
            <button className="btn-send" onClick={handleSend} disabled={sending}>
              {sending ? '⏳ Отправка...' : '✉ Отправить'}
            </button>
          </div>
        </div>
      )}

      {!preview && (
        <div className="chat-input">
          <div className="chat-input-hint">
            {mode === 'ai'
              ? '🤖 Напиши инструкцию на русском → Claude сам напишет ответ клиенту'
              : 'Пиши на русском → клиент получит на испанском'}
          </div>
          <div className="chat-input-row">
            <textarea className="chat-input-field"
              placeholder={mode === 'ai' ? 'Скажи ему что можем начать завтра...' : 'Напиши сообщение...'}
              value={inputText} onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown} rows={1} />
            <button className={`btn-mode ${mode === 'ai' ? 'active' : ''}`}
              onClick={() => setMode(mode === 'ai' ? 'translate' : 'ai')}>
              {mode === 'ai' ? '🤖' : '📝'}
            </button>
            <button className="btn-translate"
              onClick={mode === 'ai' ? handleAiReply : handleTranslate}
              disabled={!inputText.trim() || translating}>
              {translating ? '⏳' : mode === 'ai' ? '🤖 AI →' : '→ ES'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
