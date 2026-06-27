'use client';

import { useRef, useEffect, useState } from 'react';
import { Message, Memory } from '@/app/data/types';
import type { DisplayCharacter } from '../ChatClient';
import MessageBubble from './MessageBubble';

interface ChatWindowProps {
  character: DisplayCharacter;
  messages: Message[];
  onSend: (content: string) => void;
  isLoading: boolean;
  memory?: Memory;
  onNewChat: () => void;
  onSidebarToggle: () => void;
  onOpenSettings: () => void;
}

// 判断是否为图片头像
function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:') || avatar.startsWith('http');
}

export default function ChatWindow({
  character,
  messages,
  onSend,
  isLoading,
  memory,
  onNewChat,
  onSidebarToggle,
onOpenSettings,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getMemoryStats = (): string => {
    if (!memory) return '';
    const parts: string[] = [];
    if (memory.totalChatTime > 0) {
      parts.push(`累计陪伴 ${memory.totalChatTime} 分钟`);
    }
    if (memory.keyFacts.length > 0) {
      parts.push(`记住 ${memory.keyFacts.length} 件事`);
    }
    if (memory.dailyCheckIns.length > 0) {
      parts.push(`打卡 ${memory.dailyCheckIns.length} 天`);
    }
    if (character.id === 'weiyang' && memory.studyHours && memory.studyHours > 0) {
      parts.push(`学习 ${memory.studyHours}h`);
    }
    return parts.join(' · ');
  };

  const memoryStats = getMemoryStats();
  const avatarIsImage = isImageAvatar(character.displayAvatar);

  return (
    <div className="chat-main">
      <div className="chat-header">
        <button className="chat-menu-btn" onClick={onSidebarToggle} title="切换角色">
          ☰
        </button>
        <div className="chat-header-avatar">
          {avatarIsImage ? (
            <img src={character.displayAvatar} alt={character.displayName} />
          ) : (
            character.displayAvatar
          )}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{character.displayName}</div>
          <div className="chat-header-title">
            {character.isCustom ? '自定义角色' : character.title}
          </div>
        </div>
        {memoryStats && (
          <div className="chat-header-memory">{memoryStats}</div>
        )}
        <div className="chat-header-actions">
          <button className="chat-new-btn" onClick={onOpenSettings} title="角色设定">
            ⚙️ 设定
          </button>
          <button className="chat-new-btn" onClick={onNewChat} title="新建对话" style={{ marginLeft: 8 }}>
            🔄 新对话
          </button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-avatar">
              {avatarIsImage ? (
                <img src={character.displayAvatar} alt={character.displayName} />
              ) : (
                character.displayAvatar
              )}
            </div>
            <h2 className="chat-welcome-name">你好，我是{character.displayName}</h2>
            <p className="chat-welcome-title">
              {character.isCustom ? '自定义角色' : character.title}
            </p>
            <p className="chat-welcome-desc">{character.displayDescription}</p>
            <p className="chat-welcome-hint">开始和{character.displayName}对话吧~</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} character={character} />
          ))
        )}
        {isLoading && (
          <div className="message-row message-row-assistant">
            <div className="message-avatar">
              {avatarIsImage ? (
                <img src={character.displayAvatar} alt={character.displayName} />
              ) : (
                character.displayAvatar
              )}
            </div>
            <div className="message-bubble bubble-assistant">
              <div className="typing-indicator">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`和${character.displayName}说点什么吧...`}
          rows={1}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? '...' : '📤'}
        </button>
      </div>
    </div>
  );
}