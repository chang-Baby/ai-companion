import { Suspense } from 'react';
import type { CharacterId, ChatSettings } from '../data/types';
import { isKnownCharacter, CHARACTERS } from '../data/characters';
import ChatClient from './ChatClient';

interface ChatPageProps {
  searchParams: Promise<{
    character?: string;
    name?: string;
    avatar?: string;
    style?: string;
    isCustom?: string;
    customName?: string;
    customDesc?: string;
    customStyleDesc?: string;
  }>;
}

function ChatLoadingFallback() {
  return (
    <div className="chat-layout">
      <div className="sidebar skeleton-sidebar">
        <div className="skeleton-header" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-card" />
        ))}
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
  const characterParam = params.character;
  const id: CharacterId =
    characterParam && isKnownCharacter(characterParam)
      ? characterParam
      : CHARACTERS[0].id;

  const settings: ChatSettings = {
    isCustom: params.isCustom === 'true',
    customName: params.customName || '',
    customDesc: params.customDesc || '',
    customStyleDesc: params.customStyleDesc || '',
    avatar: params.avatar || '',
    style: params.style || '',
  };

  return (
    <Suspense fallback={<ChatLoadingFallback />}>
      <ChatClient initialCharacterId={id} initialSettings={settings} />
    </Suspense>
  );
}