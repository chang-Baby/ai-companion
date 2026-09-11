'use client';

import { BG_PRESETS, BUBBLE_PRESETS } from '../../data/themes';
import type { ChatTheme } from '../../data/types';

interface AppearancePanelProps {
  theme: ChatTheme;
  onChange: (t: ChatTheme) => void;
  onClose: () => void;
}

/* 外观设置：换聊天背景 + 换气泡配色，选择即预览，自动保存本地 */
export default function AppearancePanel({ theme, onChange, onClose }: AppearancePanelProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content appearance-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">🎨 聊天外观</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ gap: 20 }}>
          <div className="modal-setting-group">
            <label className="modal-label">聊天背景</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {BG_PRESETS.map((bg) => {
                const active = theme.bg === bg.key;
                return (
                  <button
                    key={bg.key}
                    onClick={() => onChange({ ...theme, bg: bg.key })}
                    className={`theme-swatch ${active ? 'theme-swatch-active' : ''}`}
                    style={{ background: bg.chatBg, borderColor: active ? 'rgba(125,211,252,0.7)' : bg.border }}
                  >
                    <span className="theme-swatch-emoji">{bg.emoji}</span>
                    <span className="theme-swatch-name">{bg.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="modal-setting-group">
            <label className="modal-label">气泡配色</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {BUBBLE_PRESETS.map((bp) => {
                const active = theme.bubble === bp.key;
                return (
                  <button
                    key={bp.key}
                    onClick={() => onChange({ ...theme, bubble: bp.key })}
                    className={`theme-bubble-row ${active ? 'theme-bubble-row-active' : ''}`}
                  >
                    <div className="theme-bubble-preview theme-bubble-preview-ai" style={{ background: bp.aiBg, color: bp.aiText }}>
                      怎么啦，和我说说？
                    </div>
                    <div className="theme-bubble-preview theme-bubble-preview-user" style={{ background: bp.userBg, color: bp.userText }}>
                      嗯嗯我在呢
                    </div>
                    <span className="theme-bubble-name">{bp.emoji} {bp.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
