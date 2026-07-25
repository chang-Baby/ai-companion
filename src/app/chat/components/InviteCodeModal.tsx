'use client';

import { useState } from 'react';

interface InviteCodeModalProps {
  charName: string;
  onUpgrade: (code: string) => void;
  onClose: () => void;
}

export default function InviteCodeModal({ charName, onUpgrade, onClose }: InviteCodeModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) { setError('请输入邀请码'); return; }
    setLoading(true); setError('');
    onUpgrade(code.trim());
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">邀请码升级</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', margin: 0 }}>
            「{charName}」的免费对话次数已用完<br />
            输入邀请码可解锁无限对话
          </p>
          <input
            type="text" className="modal-input"
            value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="输入邀请码..." autoFocus
            style={{ textAlign: 'center' }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>以后再说</button>
          <button className="modal-save-btn" onClick={handleSubmit} disabled={loading}>
            {loading ? '验证中...' : '升级'}
          </button>
        </div>
      </div>
    </div>
  );
}