import { useState } from 'react';
import LangSwitcher from './LangSwitcher.jsx';

export default function LoginScreen({ T, lang, setLang, login, loginError, loggingIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function onSubmit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    login(username, password);
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <form onSubmit={onSubmit} className="card" style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 22, fontWeight: 500, textAlign: 'center' }}>{T.loginTitle}</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.usernameLabel}</label>
            <input className="field-input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{T.passwordLabel}</label>
            <input className="field-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {loginError && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--terracotta)' }}>{T.loginError}</p>}

          <button type="submit" className="btn-primary" disabled={loggingIn}>
            {loggingIn ? T.loggingIn : T.loginBtn}
          </button>
        </form>
      </div>
    </div>
  );
}
