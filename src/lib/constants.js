export const STATES = {
  NEW:               { label: 'Nuevo',          color: '#6B7280', bg: '#F3F4F6' },
  QUALIFYING:        { label: 'Cualificando',   color: '#3B82F6', bg: '#EFF6FF' },
  PDF_AUDIT:         { label: 'PDF Enviado',    color: '#8B5CF6', bg: '#F5F3FF' },
  PRESENTING_OFFER:  { label: 'Oferta',         color: '#F59E0B', bg: '#FFFBEB' },
  PAYMENT_PENDING:   { label: 'Pago Pendiente', color: '#EF4444', bg: '#FEF2F2' },
  COLLECTING_INFO:   { label: 'Datos',          color: '#10B981', bg: '#ECFDF5' },
  COLLECTING_PHOTOS: { label: 'Fotos',          color: '#14B8A6', bg: '#F0FDFA' },
  BUILDING:          { label: 'Construyendo',   color: '#6366F1', bg: '#EEF2FF' },
  CAMPAIGN_ACTIVE:   { label: 'Activa',         color: '#22C55E', bg: '#F0FDF4' },
  TRIAL_ENDING:      { label: 'Fin Trial',      color: '#F97316', bg: '#FFF7ED' },
  SUBSCRIBED:        { label: 'Suscrito',       color: '#059669', bg: '#ECFDF5' },
  LOST:              { label: 'Perdido',        color: '#9CA3AF', bg: '#F9FAFB' },
}

export const FILTERS = [
  { key: 'ALL',        label: 'Todos' },
  { key: 'SALES',      label: 'Ventas',      states: ['NEW','QUALIFYING','PDF_AUDIT','PRESENTING_OFFER','PAYMENT_PENDING'] },
  { key: 'ACTIVE',     label: 'Activos',     states: ['CAMPAIGN_ACTIVE','SUBSCRIBED'] },
  { key: 'ONBOARDING', label: 'Onboarding',  states: ['COLLECTING_INFO','COLLECTING_PHOTOS','BUILDING'] },
]

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  const mins = Math.floor((now - date) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}
