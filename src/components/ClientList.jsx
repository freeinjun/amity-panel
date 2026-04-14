import { useState, useMemo } from 'react'
import { STATES, FILTERS, timeAgo } from '../lib/constants'

export default function ClientList({ clients, selectedId, onSelect, unreadIds = new Set() }) {
  const [filter, setFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    let list = clients
    const f = FILTERS.find(f => f.key === filter)
    if (f && f.states) {
      list = list.filter(c => f.states.includes(c.current_state))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        (c.sender_name || '').toLowerCase().includes(q) ||
        (c.phone_number || '').includes(q)
      )
    }
    return list
  }, [clients, filter, search])

  const stateStyle = (state) => {
    const s = STATES[state] || STATES.NEW
    return { color: s.color, background: s.bg, border: `1px solid ${s.color}33` }
  }

  return (
    <div className="panel-left">
      <div className="search-box">
        <input type="text" placeholder="Buscar cliente..." value={search}
          onChange={e => setSearch(e.target.value)} className="search-input" />
      </div>
      <div className="filters">
        {FILTERS.map(f => (
          <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="client-list">
        {filtered.length === 0 && <div className="empty-msg">Нет клиентов</div>}
        {filtered.map(c => {
          const s = STATES[c.current_state] || STATES.NEW
          const isUnread = unreadIds.has(c.id)
          return (
            <div key={c.id}
              className={`client-item ${c.id === selectedId ? 'selected' : ''} ${isUnread ? 'unread' : ''}`}
              onClick={() => onSelect(c.id)}>
              <div className="client-row">
                <div className="client-info">
                  <div className="client-avatar" style={{ background: s.bg, color: s.color }}>
                    {(c.sender_name || '?').charAt(0)}
                    {isUnread && <span className="unread-dot"></span>}
                  </div>
                  <div>
                    <div className="client-name">{c.sender_name || 'Sin nombre'}</div>
                    <div className="client-city">
                      {c.phone_number?.replace('@c.us', '').replace(/^34/, '+34 ')}
                    </div>
                  </div>
                </div>
                <span className="state-badge" style={stateStyle(c.current_state)}>{s.label}</span>
              </div>
              {c._lastMessage && <div className="client-lastmsg">{c._lastMessage}</div>}
              <div className="client-time">{timeAgo(c.last_message_at)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
