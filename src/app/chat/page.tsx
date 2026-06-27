import { Suspense } from 'react';
import type { CharacterId, ChatSettings } from '../data/types';
import { isPresetCharacter, PRESET_CHARACTERS } from '../data/characters';
import ChatClient from './ChatClient';

interface ChatPageProps {
  searchParams: Promise<{ character?: string; avatar?: string }>;
}

function ChatLoadingFallback() {
  return (
    <div className="chat-layout">
      <div className="sidebar skeleton-sidebar">
        <div className="skeleton-header" />
        {[1, 2, 3, 4].map((i) => (<div key={i} className="skeleton-card" />))}
      </div>
      <div className="chat-main">
        <div className="skeleton-chat-header" />
        <div className="skeleton-messages" />
        <div className="skeleton-input" />
      </div>
    </div>
  );
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const params = await searchParams;
  const char = params.character;
  const avatar = params.avatar;

  let id: CharacterId;
  if (char && (isPresetCharacter(char) || char.startsWith('custom_'))) {
    id = char;
  } else {
    id = PRESET_CHARACTERS[0].id;
  }

  const settings: ChatSettings = { avatar: avatar || '' };

  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatClient initialCharacterId={id} initialSettings={settings} />
    </Suspense>
  );
}