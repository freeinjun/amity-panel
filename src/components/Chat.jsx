import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { STATES } from '../lib/constants'

// Make URLs clickable
const linkify = (text) => {
  if (!text) return text
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="msg-link">{part}</a>
    }
    return part
  })
}

export default function Chat({ client, messages, onMessageSent }) {
  const [showRu, setShowRu] = useState(true)
  const [inputText, setInputText] = useState('')
  const [preview, setPreview] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [sending, setSending] = useState(false)
  const [mode, setMode] = useState('translate')
  const [transcribing, setTranscribing] = useState({})
  const [showStateMenu, setShowStateMenu] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const messagesEndRef = useRef(null)
  const stateMenuRef = useRef(null)
  const fileInputRef = useRef(null)
  const searchInputRef = useRef(null)
  const msgRefs = useRef({})

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const handleClick = (e) => {
      if (stateMenuRef.current && !stateMenuRef.current.contains(e.target)) {
        setShowStateMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Focus search input when opened
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return messages.filter(m =>
      (m.message_text || '').toLowerCase().includes(q) ||
      (m.message_text_ru || '').toLowerCase().includes(q) ||
      (m.audio_transcription || '').toLowerCase().includes(q) ||
      (m.audio_transcription_ru || '').toLowerCase().includes(q)
    )
  }, [messages, searchQuery])

  // Scroll to current search result
  useEffect(() => {
    if (searchResults.length > 0 && searchResults[searchIndex]) {
      const id = searchResults[searchIndex].id
      msgRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchIndex, searchResults])

  // Reset search index when query changes
  useEffect(() => {
    setSearchIndex(0)
  }, [searchQuery])

  if (!client) {
    return (
      <div className="panel-center">
        <div className="empty-msg" style={{ marginTop: '40%' }}>← Выбери клиента из списка</div>
      </div>
    )
  }

  const state = STATES[client.current_state] || STATES.NEW

  const formatDateLabel = (dateStr) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const isSameDay = (a, b) =>
      a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    if (isSameDay(date, today)) return 'Сегодня'
    if (isSameDay(date, yesterday)) return 'Вчера'
    return date.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
  }

  const getDateKey = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }

  const startEditName = () => {
    setNameInput(client.sender_name || '')
    setEditingName(true)
  }

  const saveName = async () => {
    const newName = nameInput.trim()
    if (newName && newName !== client.sender_name) {
      await supabase.from('clients')
        .update({ sender_name: newName, updated_at: new Date().toISOString() })
        .eq('id', client.id)
    }
    setEditingName(false)
  }

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') saveName()
    if (e.key === 'Escape') setEditingName(false)
  }

  const changeState = async (newState) => {
    const onboardingStates = ['COLLECTING_INFO', 'COLLECTING_PHOTOS', 'BUILDING']
    const activeStates = ['CAMPAIGN_ACTIVE', 'TRIAL_ENDING', 'SUBSCRIBED']
    let phase = 'sales'
    if (onboardingStates.includes(newState)) phase = 'onboarding'
    else if (activeStates.includes(newState)) phase = 'active'
    else if (newState === 'LOST') phase = 'churned'
    await supabase.from('clients')
      .update({ current_state: newState, current_phase: phase, updated_at: new Date().toISOString() })
      .eq('id', client.id)
    setShowStateMenu(false)
  }

  

  const handleDeleteClient = async () => {
    if (!window.confirm('Удалить клиента ' + client.sender_name + ' и всю переписку?')) return
    if (!window.confirm('Точно удалить? Это нельзя отменить.')) return
    await supabase.from('conversations').delete().eq('client_id', client.id)
    await supabase.from('clients').delete().eq('id', client.id)
    if (onMessageSent) onMessageSent('deleted')
  }

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

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !client) return
    fileInputRef.current.value = ''
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${client.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file)
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
      const fileUrl = urlData.publicUrl
      const caption = inputText.trim()
      setInputText('')
      await supabase.functions.invoke('send-file', {
        body: { phone: client.phone_number, fileUrl, fileName: file.name, caption }
      })
      let mediaType = 'document'
      if (file.type.startsWith('image/')) mediaType = 'image'
      else if (file.type.startsWith('video/')) mediaType = 'video'
      else if (file.type.startsWith('audio/')) mediaType = 'audio'
      await supabase.from('conversations').insert({
        client_id: client.id, direction: 'out',
        message_text: caption || file.name, message_text_ru: caption || file.name,
        media_url: fileUrl, media_type: mediaType,
        sender: 'denis', bot_type: 'denis', state_at_time: client.current_state,
      })
      await supabase.from('clients')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', client.id)
    } catch (err) {
      alert('Ошибка загрузки: ' + err.message)
    }
    setUploading(false)
  }


  const handleRetranslate = async (msg) => {
    if (!msg.message_text) return
    setTranscribing(prev => ({ ...prev, ['tr_' + msg.id]: true }))
    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { text: msg.message_text, from: 'es', to: 'ru' }
      })
      if (error) throw error
      const { error: updateError } = await supabase.from('conversations')
        .update({ message_text_ru: data.translated })
        .eq('id', msg.id)
      if (onMessageSent) onMessageSent()
    } catch (err) {
      console.error('Retranslate error:', err)
    }
    setTranscribing(prev => ({ ...prev, ['tr_' + msg.id]: false }))
  }

  const handleTranscribe = async (msg) => {
    setTranscribing(prev => ({ ...prev, [msg.id]: true }))
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { messageId: msg.id, mediaUrl: msg.media_url }
      })
      if (error) throw error
      msg.audio_transcription = data.transcription
      msg.audio_transcription_ru = data.transcriptionRu
    } catch (err) {
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

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (searchResults.length > 0) {
        setSearchIndex(prev => (prev + 1) % searchResults.length)
      }
    }
    if (e.key === 'Escape') {
      setShowSearch(false)
      setSearchQuery('')
    }
  }

  const toggleSearch = () => {
    setShowSearch(!showSearch)
    if (showSearch) setSearchQuery('')
  }

  // Check if message is highlighted by search
  const isHighlighted = (m) => {
    if (!searchQuery.trim()) return false
    return searchResults.some(r => r.id === m.id)
  }

  const isCurrentResult = (m) => {
    if (!searchResults.length) return false
    return searchResults[searchIndex]?.id === m.id
  }

  const renderMessage = (m) => {
    const isAudio = m.media_type === 'audio'
    const isImage = m.media_type === 'image'
    const isVideo = m.media_type === 'video'
    const highlighted = isHighlighted(m)
    const current = isCurrentResult(m)

    return (
      <div key={m.id} ref={el => msgRefs.current[m.id] = el}
        className={`msg-row ${m.direction} ${highlighted ? 'search-hit' : ''} ${current ? 'search-current' : ''}`}>
        <div className={`msg-bubble ${m.direction}`}>
          {m.direction === 'out' && (
            <div className="msg-from">
              {m.sender === 'bot' || m.sender === 'jane' ? '🤖 Jane' : '👤 Denis'}
            </div>
          )}

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
                <button className="btn-transcribe" onClick={() => handleTranscribe(m)}
                  disabled={transcribing[m.id]}>
                  {transcribing[m.id] ? '⏳ Расшифровка...' : '🎤 Расшифровать'}
                </button>
              )}
            </div>
          )}

          {isImage && m.media_url && (
            <div className="msg-image">
              <a href={m.media_url} target="_blank" rel="noopener noreferrer">
                <img src={m.media_url} alt="" className="msg-img-preview" />
              </a>
            </div>
          )}

          {isVideo && m.media_url && (
            <div className="msg-video">
              <video controls preload="metadata" className="msg-video-player">
                <source src={m.media_url} />
              </video>
            </div>
          )}

          {m.message_text && <div className="msg-text">{linkify(m.message_text)}</div>}

          {showRu && m.message_text_ru && !isAudio && (
            <div className={`msg-translation ${m.direction}`}>{linkify(m.message_text_ru)}</div>
          )}
          {showRu && m.message_text && !isAudio && (!m.message_text_ru || !/[а-яА-ЯёЁ]/.test(m.message_text_ru)) && (
            <button className="btn-retranslate" onClick={() => handleRetranslate(m)}
              disabled={transcribing['tr_' + m.id]}>
              {transcribing['tr_' + m.id] ? '⏳' : '🔄 Перевести'}
            </button>
          )}

          <div className="msg-time">{msgTime(m.created_at)}</div>
        </div>
      </div>
    )
  }

  const renderMessagesWithDates = () => {
    let lastDateKey = null
    const elements = []
    messages.forEach((m) => {
      const dateKey = getDateKey(m.created_at)
      if (dateKey !== lastDateKey) {
        elements.push(
          <div key={`date-${dateKey}`} className="date-separator">
            <span className="date-separator-text">{formatDateLabel(m.created_at)}</span>
          </div>
        )
        lastDateKey = dateKey
      }
      elements.push(renderMessage(m))
    })
    return elements
  }

  return (
    <div className="panel-center">
      <div className="chat-header">
        <div className="chat-header-left">
          {editingName ? (
            <input className="name-edit-input" value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={handleNameKeyDown} onBlur={saveName} autoFocus />
          ) : (
            <span className="chat-header-name" onClick={startEditName} title="Нажми чтобы изменить имя">
              {client.sender_name} ✎
            </span>
          )}
          <div className="state-selector" ref={stateMenuRef}>
            <span className="state-badge state-clickable" style={{
              color: state.color, background: state.bg, border: `1px solid ${state.color}33`
            }} onClick={() => setShowStateMenu(!showStateMenu)}>
              {state.label} ▾
            </span>
            {showStateMenu && (
              <div className="state-dropdown">
                {Object.entries(STATES).map(([key, val]) => (
                  <div key={key}
                    className={`state-option ${key === client.current_state ? 'current' : ''}`}
                    onClick={() => changeState(key)}>
                    <span className="state-dot" style={{ background: val.color }}></span>
                    {val.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="chat-btns">
          <button className={`chat-btn ${showSearch ? 'active' : ''}`} onClick={toggleSearch}>
            🔍
          </button>
          <button className={`chat-btn ${showRu ? 'active' : ''}`} onClick={() => setShowRu(!showRu)}>
            🇷🇺 RU {showRu ? 'вкл' : 'выкл'}
          </button>
          <button className={`chat-btn ${client.is_paused ? 'paused' : ''}`} onClick={togglePause}>
            {client.is_paused ? '⏸ Bot paused' : '▶ Bot active'}
          </button>
          <button className="chat-btn btn-delete" onClick={handleDeleteClient} title="Удалить клиента">
            🗑
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="search-bar">
          <input className="search-bar-input" ref={searchInputRef}
            placeholder="Поиск по переписке..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown} />
          {searchResults.length > 0 && (
            <div className="search-nav">
              <span className="search-count">{searchIndex + 1}/{searchResults.length}</span>
              <button className="search-nav-btn" onClick={() => setSearchIndex(prev => Math.max(0, prev - 1))}>▲</button>
              <button className="search-nav-btn" onClick={() => setSearchIndex(prev => Math.min(searchResults.length - 1, prev + 1))}>▼</button>
            </div>
          )}
          {searchQuery && searchResults.length === 0 && (
            <span className="search-count">Не найдено</span>
          )}
          <button className="search-close" onClick={toggleSearch}>✕</button>
        </div>
      )}

      <div className="messages">
        {messages.length === 0 && <div className="empty-msg">Переписка пуста</div>}
        {renderMessagesWithDates()}
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
            <button className="btn-attach" onClick={() => fileInputRef.current?.click()}
              disabled={uploading} title="Прикрепить файл">
              {uploading ? '⏳' : '📎'}
            </button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }}
              onChange={handleFileSelect} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" />
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
