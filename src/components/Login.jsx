import { useState } from 'react'

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    const correct = import.meta.env.VITE_PANEL_PASSWORD
    if (password === correct) {
      localStorage.setItem('amity_auth', 'true')
      onLogin()
    } else {
      setError(true)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">AMITY</div>
        <div className="login-sub">Panel de Control</div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            className="login-input"
            placeholder="Пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
          <button type="submit" className="login-btn">Войти</button>
        </form>
        {error && <div className="login-error">Неверный пароль</div>}
      </div>
    </div>
  )
}
