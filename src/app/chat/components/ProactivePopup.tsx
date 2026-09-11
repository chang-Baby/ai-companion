'use client';

import type { DisplayCharacter } from '../../data/types';

function isImage(s: string) {
  return s.startsWith('data:') || s.startsWith('http') || s.startsWith('/');
}

interface ProactivePopupProps {
  character: DisplayCharacter;
  content: string;
  onOpen: () => void;
  onClose: () => void;
}

/* 主动消息通知弹窗：像朋友突然弹来的消息，而不是静默出现在列表里 */
export default function ProactivePopup({ character, content, onOpen, onClose }: ProactivePopupProps) {
  const avatarIsImage = isImage(character.displayAvatar);
  return (
    <div className="proactive-toast" onClick={onOpen} title="点击回到对话">
      <button
        className="proactive-toast-close"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="关闭"
      >
        ✕
      </button>
      <div className="proactive-toast-avatar">
        {avatarIsImage
          ? <img src={character.displayAvatar} alt={character.name} />
          : <span>{character.displayAvatar}</span>}
      </div>
      <div className="proactive-toast-body">
        <div className="proactive-toast-name">
          {character.name}
          <span className="proactive-toast-tag">主动找你</span>
        </div>
        <div className="proactive-toast-text">{content}</div>
      </div>
    </div>
  );
}
