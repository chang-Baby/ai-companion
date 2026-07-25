'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const pw = password.trim();
    if (!pw) { setError('请输入网站密码'); return; }
    setLoading(true); setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_session', data.sessionId);
        localStorage.setItem('auth_vip', 'false');
        router.push('/chat?character=ji_linyuan');
      } else {
        setError(data.error || '密码错误');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="homepage">
      <div className="homepage-bg"><div className="homepage-gradient" /></div>
      <div className="homepage-glow homepage-glow-1" />
      <div className="homepage-glow homepage-glow-2" />

      <div className="homepage-content">
        <div className="homepage-badge">❄️ AI 伴你 · 冰蓝之境</div>
        <h1 className="homepage-title">AI Companion</h1>
        <p className="homepage-subtitle">请输入网站密码以继续</p>

        <div className="login-card">
          <input
            type="password"
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="输入网站密码..."
            autoFocus
          />
          {error && <div className="login-error">{error}</div>}
          <button className="login-btn" onClick={handleLogin} disabled={loading}>
            {loading ? '验证中...' : '进入'}
          </button>
        </div>

        <div className="homepage-footer">AI 伴你 · 冰蓝之境 · {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}