'use client';

import type { Message, DisplayCharacter } from '../../data/types';
import { speak } from './tts-player';

function isImage(s: string) { return s.startsWith('data:') || s.startsWith('http') || s.startsWith('/'); }

/* 转账卡片 */
function TransferCard({ amount }: { amount: string }) {
  return (
    <div style={{ width: 260, background: '#F9F9F9', border: '1px solid #E5E5E5', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#F5A623', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#FFF', fontSize: 28, fontWeight: 500 }}>¥</span>
        </div>
        <span style={{ fontSize: 28, fontWeight: 600, color: '#1A1A1A' }}>{amount}</span>
      </div>
      <div style={{ fontSize: 12, color: '#8C8C8C', alignSelf: 'flex-start' }}>转账</div>
      <button style={{ width: '100%', height: 40, borderRadius: 6, border: 'none', background: '#07C160', color: '#FFF', fontSize: 15, fontWeight: 500, cursor: 'pointer' }}>确认收款</button>
    </div>
  );
}

/* 解析消息类型 */
function parseCard(content: string): { type: 'normal' | 'transfer'; data?: Record<string, string> } {
  if (content.startsWith('TRANSFER_CARD:')) return { type: 'transfer', data: { amount: content.slice(14) } };
  return { type: 'normal' };
}

export default function MessageBubble({ message, character, voice }: { message: Message; character: DisplayCharacter; voice?: string[] }) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const card = parseCard(message.content);
  const avatarEl = isImage(character.displayAvatar)
    ? <img src={character.displayAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <span style={{ fontSize: 22 }}>{character.displayAvatar}</span>;

  // 转账卡片
  if (card.type === 'transfer') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        <div className="message-time" style={{ color: '#B2B2B2', fontSize: 12, margin: '12px 0' }}>{time}</div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: '70%', alignSelf: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'rgba(0,0,0,0.04)' }}>{avatarEl}</div>
          <TransferCard amount={card.data?.amount || '0'} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div className="message-time" style={{ color: 'rgba(148,163,184,0.6)', fontSize: 12, textAlign: 'center', margin: '12px 0' }}>{time}</div>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        maxWidth: '70%',
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {!isUser && (
          <div style={{ width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'linear-gradient(145deg,#1a1a28,#22223a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{avatarEl}</div>
        )}
        <div>
          {!isUser && (
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, paddingLeft: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{character.name}</span>
              {message.proactive && (
                <span style={{
                  fontSize: 11, color: '#f9a8d4',
                  background: 'rgba(244,114,182,0.10)',
                  border: '1px solid rgba(244,114,182,0.30)',
                  borderRadius: 999, padding: '0 8px', lineHeight: '18px',
                }}>主动找你</span>
              )}
              {!card.type.startsWith('transfer') && (
                <button
                  onClick={() => speak(message.content, voice)}
                  title="念给我听"
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    fontSize: 12, color: 'rgba(148,163,184,0.75)', padding: '0 2px',
                    lineHeight: 1, opacity: 0.8,
                  }}
                >🔊</button>
              )}
            </div>
          )}
          <div style={{
            padding: '11px 15px',
            fontSize: 15,
            lineHeight: 1.55,
            boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
            background: isUser
              ? 'var(--bubble-user-bg, linear-gradient(145deg,#3a3a4e,#2c2c3e))'
              : 'var(--bubble-ai-bg, rgba(255,255,255,0.06))',
            color: isUser
              ? 'var(--bubble-user-text, rgba(255,255,255,0.95))'
              : 'var(--bubble-ai-text, rgba(255,255,255,0.88))',
            borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
            border: isUser ? 'none' : '1px solid rgba(255,255,255,0.05)',
            backdropFilter: isUser ? 'none' : 'blur(8px)',
            WebkitBackdropFilter: isUser ? 'none' : 'blur(8px)',
            marginLeft: isUser ? 0 : 8,
            marginRight: isUser ? 8 : 0,
          }}>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>
          </div>
        </div>
      </div>
    </div>
  );
}