'use client';

import type { Message, DisplayCharacter } from '../../data/types';

interface MessageBubbleProps {
  message: Message;
  character: DisplayCharacter;
}

function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:') || avatar.startsWith('http');
}

export default function MessageBubble({ message, character }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const time = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const avatarIsImage = isImageAvatar(character.displayAvatar);

  return (
    <div className={`message-row ${isUser ? 'message-row-user' : 'message-row-assistant'}`}>
      {!isUser && (
        <div className="message-avatar">
          {avatarIsImage ? (
            <img src={character.displayAvatar} alt={character.name} />
          ) : (
            character.displayAvatar
          )}
        </div>
      )}
      <div className={`message-bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
        <div className="message-content">{message.content}</div>
        <div className="message-time">{time}</div>
      </div>
      {isUser && (
        <div className="message-avatar message-avatar-user">👤</div>
      )}
    </div>
  );
}