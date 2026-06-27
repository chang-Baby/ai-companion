'use client';

import { CharacterConfig, CharacterId } from '@/app/data/types';
import type { DisplayCharacter } from '../ChatClient';

interface SidebarProps {
  characters: CharacterConfig[];
  activeId: CharacterId;
  onSelect: (id: CharacterId, settings?: any) => void;
  onNewChat: (id: CharacterId) => void;
  collapsed: boolean;
  onToggle: () => void;
  getDisplayChar: (id: CharacterId) => DisplayCharacter;
  onOpenSettings: () => void;
}

// 判断是否为图片头像
function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:') || avatar.startsWith('http');
}

export default function Sidebar({
  characters,
  activeId,
  onSelect,
  onNewChat,
  collapsed,
  onToggle,
  getDisplayChar,
  onOpenSettings,
}: SidebarProps) {
  return (
    <>
      {!collapsed && <div className="sidebar-overlay" onClick={onToggle} />}

      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2 className="sidebar-title">AI Companion</h2>
          <button className="sidebar-close-btn" onClick={onToggle} title="收起侧边栏">
            ✕
          </button>
        </div>

        <div className="sidebar-characters">
          {characters.map((char) => {
            const display = getDisplayChar(char.id);
            return (
              <div
                key={char.id}
                className={`sidebar-character ${activeId === char.id ? 'sidebar-character-active' : ''}`}
                onClick={() => onSelect(char.id)}
              >
                <div className="sidebar-character-avatar">
                  {isImageAvatar(display.displayAvatar) ? (
                    <img src={display.displayAvatar} alt={display.displayName} />
                  ) : (
                    display.displayAvatar
                  )}
                </div>
                <div className="sidebar-character-info">
                  <div className="sidebar-character-name">{display.displayName}</div>
                  <div className="sidebar-character-title">
                    {display.isCustom ? '自定义角色' : char.title}
                  </div>
                </div>
                {activeId === char.id && (
                  <>
                    <button
                      className="sidebar-new-chat-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewChat(char.id);
                      }}
                      title="新建对话"
                    >
                      🔄
                    </button>
                    <button
                      className="sidebar-new-chat-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSettings();
                      }}
                      title="角色设定"
                      style={{ marginLeft: 4 }}
                    >
                      ⚙️
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <a href="/" className="sidebar-back-link">
            ← 返回首页
          </a>
        </div>
      </aside>
    </>
  );
}