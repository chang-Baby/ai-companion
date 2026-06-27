'use client';

import type { CharacterConfig, CustomCharacter, CharacterId } from '../../data/types';

interface SidebarProps {
  presetChars: CharacterConfig[];
  customChars: CustomCharacter[];
  activeId: CharacterId;
  onSelect: (id: CharacterId) => void;
  onNewChat: (id: CharacterId) => void;
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: (charId: CharacterId) => void;
  onCreateCharacter: () => void;
  onDeleteCharacter: (id: string) => void;
  avatarOverrides: Record<string, string>;
}

function isImageUrl(s: string): boolean {
  return s.startsWith('data:') || s.startsWith('http');
}

function getAvatar(char: CharacterConfig | CustomCharacter, overrides: Record<string, string>): string {
  if (overrides[char.id]) return overrides[char.id];
  if ('avatar' in char && char.avatar) return char.avatar!;
  return char.emoji;
}

export default function Sidebar({
  presetChars, customChars, activeId, onSelect, onNewChat,
  collapsed, onToggle, onOpenSettings, onCreateCharacter, onDeleteCharacter, avatarOverrides,
}: SidebarProps) {
  return (
    <>
      {!collapsed && <div className="sidebar-overlay" onClick={onToggle} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">AI Companion</h2>
          <button className="sidebar-close-btn" onClick={onToggle} title="收起">✕</button>
        </div>

        <div className="sidebar-characters">
          {/* 预设角色 */}
          {presetChars.map((char) => {
            const av = getAvatar(char, avatarOverrides);
            const avImg = isImageUrl(av);
            return (
              <div key={char.id}
                className={`sidebar-character ${activeId === char.id ? 'sidebar-character-active' : ''}`}
                onClick={() => onSelect(char.id)}>
                <div className="sidebar-character-avatar">
                  {avImg ? <img src={av} alt={char.name} /> : av}
                </div>
                <div className="sidebar-character-info">
                  <div className="sidebar-character-name">{char.name}</div>
                  <div className="sidebar-character-title">{char.title}</div>
                </div>
                {activeId === char.id && (
                  <>
                    <button className="sidebar-new-chat-btn" onClick={(e) => { e.stopPropagation(); onNewChat(char.id); }} title="新对话">🔄</button>
                    <button className="sidebar-new-chat-btn" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); onOpenSettings(char.id); }} title="改头像">⚙️</button>
                  </>
                )}
              </div>
            );
          })}

          {/* 分隔线 */}
          {customChars.length > 0 && <div className="sidebar-divider" />}

          {/* 自定义角色 */}
          {customChars.map((cc) => {
            const av = getAvatar(cc, avatarOverrides);
            const avImg = isImageUrl(av);
            return (
              <div key={cc.id}
                className={`sidebar-character ${activeId === cc.id ? 'sidebar-character-active' : ''}`}
                onClick={() => onSelect(cc.id)}>
                <div className="sidebar-character-avatar">
                  {avImg ? <img src={av} alt={cc.name} /> : av}
                </div>
                <div className="sidebar-character-info">
                  <div className="sidebar-character-name">{cc.name}</div>
                  <div className="sidebar-character-title">自定义</div>
                </div>
                {activeId === cc.id && (
                  <>
                    <button className="sidebar-new-chat-btn" onClick={(e) => { e.stopPropagation(); onNewChat(cc.id); }} title="新对话">🔄</button>
                    <button className="sidebar-new-chat-btn" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); onOpenSettings(cc.id); }} title="改头像">⚙️</button>
                  </>
                )}
              </div>
            );
          })}

          {/* 新建按钮 */}
          <div className="sidebar-add-btn" onClick={onCreateCharacter}>
            <span>➕</span>
            <span>新建角色</span>
          </div>
        </div>

        <div className="sidebar-footer">
          <a href="/" className="sidebar-back-link">← 返回首页</a>
        </div>
      </aside>
    </>
  );
}