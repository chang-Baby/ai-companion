'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { CharacterId, Message, Memory, DisplayCharacter, CustomCharacter, ChatSettings } from '../data/types';
import { PRESET_CHARACTERS, getPresetCharacter, isPresetCharacter, customToConfig, toDisplay } from '../data/characters';
import { createDefaultMemory } from '../data/memory-defaults';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';
import InviteCodeModal from './components/InviteCodeModal';

// localStorage keys
const KEY_CHAT = (id: string) => `companion_chat_${id}`;
const KEY_MEMORY = (id: string) => `companion_memory_${id}`;
const KEY_CUSTOM_CHARS = 'companion_custom_chars';
const KEY_AVATARS = 'companion_avatars';
const KEY_ACTIVE = 'companion_active';
const KEY_SESSION = 'auth_session';
const KEY_VIP = 'auth_vip';

// old data migration
const OLD_NAME_TO_ID: Record<string, string> = {
  '星尘': 'ji_linyuan',
  '墨离': 'lu_yanzhou',
  '云曦': 'yu_wen',
};

interface ChatClientProps {
  initialCharacterId: CharacterId;
  initialSettings: ChatSettings;
}

type ModalMode = { type: 'edit'; charId: CharacterId } | { type: 'create' } | null;

export default function ChatClient({ initialCharacterId, initialSettings }: ChatClientProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<CharacterId>(initialCharacterId);
  const [messagesByChar, setMessagesByChar] = useState<Record<string, Message[]>>({});
  const [memoryByChar, setMemoryByChar] = useState<Record<string, Memory>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeCharName, setUpgradeCharName] = useState('');
  const [isVip, setIsVip] = useState(false);
  const [quotaByChar, setQuotaByChar] = useState<Record<string, number>>({});

  const [customChars, setCustomChars] = useState<CustomCharacter[]>([]);
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>({});

  const messageCountRef = useRef<Record<string, number>>({});

  // initialization
  useEffect(() => {
    const authToken = localStorage.getItem('auth_token');
    if (!authToken) { router.push('/login'); return; }
    setIsVip(localStorage.getItem(KEY_VIP) === 'true');

    const initMsgs: Record<string, Message[]> = {};
    const initMems: Record<string, Memory> = {};
    const initCounts: Record<string, number> = {};
    const initAvatars: Record<string, string> = {};

    Object.entries(OLD_NAME_TO_ID).forEach(([name, id]) => {
      const oldKey = KEY_CHAT(name);
      const newKey = KEY_CHAT(id);
      if (localStorage.getItem(oldKey) && !localStorage.getItem(newKey)) {
        localStorage.setItem(newKey, localStorage.getItem(oldKey)!);
      }
      const oldTopic = localStorage.getItem(`companion_topic_${name}`);
      if (oldTopic && !localStorage.getItem(KEY_MEMORY(id))) {
        const mem = createDefaultMemory();
        mem.conversationSummary = oldTopic;
        localStorage.setItem(KEY_MEMORY(id), JSON.stringify(mem));
      }
    });

    PRESET_CHARACTERS.forEach((char) => {
      const saved = localStorage.getItem(KEY_CHAT(char.id));
      initMsgs[char.id] = safeParseArray(saved)?.slice(-500) || [];
      initMems[char.id] = safeParse(localStorage.getItem(KEY_MEMORY(char.id))) || createDefaultMemory();
      initCounts[char.id] = initMsgs[char.id].length;
    });

    const savedCustom = localStorage.getItem(KEY_CUSTOM_CHARS);
    const parsedCustom: CustomCharacter[] = safeParseArray(savedCustom) || [];
    setCustomChars(parsedCustom);

    parsedCustom.forEach((cc) => {
      const saved = localStorage.getItem(KEY_CHAT(cc.id));
      initMsgs[cc.id] = safeParseArray(saved)?.slice(-500) || [];
      initMems[cc.id] = safeParse(localStorage.getItem(KEY_MEMORY(cc.id))) || createDefaultMemory();
      initCounts[cc.id] = initMsgs[cc.id].length;
    });

    const savedAvatars = localStorage.getItem(KEY_AVATARS);
    if (savedAvatars) { try { Object.assign(initAvatars, JSON.parse(savedAvatars)); } catch {} }
    if (initialSettings.avatar) initAvatars[initialCharacterId] = initialSettings.avatar;

    setMessagesByChar(initMsgs);
    setMemoryByChar(initMems);
    setAvatarOverrides(initAvatars);
    messageCountRef.current = initCounts;

    const savedActive = localStorage.getItem(KEY_ACTIVE);
    if (savedActive) setActiveId(savedActive);
  }, []);

  // persist
  useEffect(() => {
    Object.entries(messagesByChar).forEach(([id, msgs]) => localStorage.setItem(KEY_CHAT(id), JSON.stringify(msgs.slice(-500))));
    Object.entries(memoryByChar).forEach(([id, mem]) => localStorage.setItem(KEY_MEMORY(id), JSON.stringify(mem)));
    localStorage.setItem(KEY_ACTIVE, activeId);
  }, [messagesByChar, memoryByChar, activeId]);

  useEffect(() => { localStorage.setItem(KEY_CUSTOM_CHARS, JSON.stringify(customChars)); }, [customChars]);
  useEffect(() => { localStorage.setItem(KEY_AVATARS, JSON.stringify(avatarOverrides)); }, [avatarOverrides]);

  // get display character
  const getDisplayChar = useCallback(
    (id: string): DisplayCharacter => {
      if (isPresetCharacter(id as any)) return toDisplay(getPresetCharacter(id as any), avatarOverrides[id]);
      const cc = customChars.find((c) => c.id === id);
      if (cc) return toDisplay(customToConfig(cc), avatarOverrides[id]);
      return toDisplay(getPresetCharacter('ji_linyuan'));
    },
    [customChars, avatarOverrides]
  );

  // settings save
  const handleSaveSettings = useCallback(
    (settings: { avatar: string }) => {
      setAvatarOverrides((prev) => ({ ...prev, [activeId]: settings.avatar }));
      setModalMode(null);
    },
    [activeId]
  );

  // invite code upgrade
  const handleUpgrade = useCallback(async (code: string) => {
    const sessionId = localStorage.getItem(KEY_SESSION) || '';
    try {
      const res = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgrade: code, sessionId }) });
      const data = await res.json();
      if (res.ok && data.vip) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem(KEY_VIP, 'true');
        setIsVip(true);
        setShowUpgrade(false);
        setQuotaByChar((prev) => ({ ...prev, [activeId]: -1 }));
      } else alert(data.error || '邀请码无效');
    } catch { alert('网络错误'); }
  }, [activeId]);

  // create custom character
  const handleCreateCharacter = useCallback(
    (cc: CustomCharacter) => {
      if (!isVip && customChars.length >= 1) {
        alert('免费用户只能创建 1 个自定义角色，输入邀请码升级后可无限创建');
        setModalMode(null);
        return;
      }
      const id = `custom_${Date.now()}`;
      const newChar: CustomCharacter = { ...cc, id, createdAt: new Date().toISOString() };
      setCustomChars((prev) => [...prev, newChar]);
      setMessagesByChar((prev) => ({ ...prev, [id]: [] }));
      setMemoryByChar((prev) => ({ ...prev, [id]: createDefaultMemory() }));
      if (cc.avatar) setAvatarOverrides((prev) => ({ ...prev, [id]: cc.avatar! }));
      setActiveId(id);
      setModalMode(null);
    },
    [isVip, customChars]
  );

  // delete custom character
  const handleDeleteCharacter = useCallback((id: string) => {
    setCustomChars((prev) => prev.filter((c) => c.id !== id));
    setMessagesByChar((prev) => { const n = { ...prev }; delete n[id]; return n as Record<string, Message[]>; });
    setMemoryByChar((prev) => { const n = { ...prev }; delete n[id]; return n as Record<string, Memory>; });
    setAvatarOverrides((prev) => { const { [id]: _, ...rest } = prev; return rest; });
    localStorage.removeItem(KEY_CHAT(id));
    localStorage.removeItem(KEY_MEMORY(id));
    if (activeId === id) setActiveId('ji_linyuan');
  }, [activeId]);

  // send message
  const handleSend = useCallback(
    async (content: string) => {
      const display = getDisplayChar(activeId);
      const currentMessages = messagesByChar[activeId] || [];
      const currentMemory = memoryByChar[activeId] || createDefaultMemory();

      const userMsg: Message = { role: 'user', content, timestamp: new Date().toISOString() };
      const updatedMessages = [...currentMessages, userMsg];
      setMessagesByChar((prev) => ({ ...prev, [activeId]: updatedMessages }));

      const today = new Date().toISOString().split('T')[0];
      const updatedMem = { ...currentMemory };
      updatedMem.totalChatTime += 1;
      updatedMem.lastUpdated = new Date().toISOString();
      const checkIn = updatedMem.dailyCheckIns.find((c) => c.date === today);
      if (checkIn) { checkIn.messageCount += 2; checkIn.duration += 1; }
      else { updatedMem.dailyCheckIns.push({ date: today, duration: 1, messageCount: 2, topics: [], mood: 'neutral' }); }
      if (updatedMem.dailyCheckIns.length > 90) updatedMem.dailyCheckIns = updatedMem.dailyCheckIns.slice(-90);
      setMemoryByChar((prev) => ({ ...prev, [activeId]: updatedMem }));

      setIsLoading(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: localStorage.getItem('auth_token') || '',
            messages: updatedMessages,
            settings: {
              characterId: display.id,
              name: display.name,
              personality: display.personality,
              styleDesc: display.styleDesc,
              description: display.description,
              style: display.isPreset ? 'gentle' : 'custom',
              memory: updatedMem,
            },
          }),
        });

        const data = await res.json();
        if (!res.ok && data.error) {
          setMessagesByChar((prev) => ({ ...prev, [activeId]: currentMessages }));
          if (res.status === 401) { localStorage.removeItem('auth_token'); router.push('/login'); return; }
          if (res.status === 403 && data.needUpgrade) { setUpgradeCharName(display.name); setShowUpgrade(true); return; }
          alert(data.error);
          return;
        }

        if (data.content) {
          if (data.remaining !== undefined) setQuotaByChar((prev) => ({ ...prev, [activeId]: data.remaining }));
          const assistantMsg: Message = { role: 'assistant', content: data.content, timestamp: new Date().toISOString() };
          const finalMessages = [...updatedMessages, assistantMsg];
          setMessagesByChar((prev) => ({ ...prev, [activeId]: finalMessages }));
          const newCount = (messageCountRef.current[activeId] || 0) + 2;
          messageCountRef.current = { ...messageCountRef.current, [activeId]: newCount };
          if (newCount % 6 === 0) triggerMemoryAnalysis(activeId, finalMessages, updatedMem);
        }
      } catch (err) { console.error('send error:', err); }
      finally { setIsLoading(false); }
    },
    [activeId, messagesByChar, memoryByChar, getDisplayChar]
  );

  async function triggerMemoryAnalysis(charId: string, msgs: Message[], mem: Memory) {
    try {
      const res = await fetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation: msgs.slice(-20), existingMemory: mem, characterId: charId }) });
      const data = await res.json();
      if (data.memory) setMemoryByChar((prev) => ({ ...prev, [charId]: data.memory }));
    } catch {}
  }

  // switch character
  const handleCharacterSwitch = useCallback((id: CharacterId) => {
    setActiveId(id);
    setSidebarCollapsed(true);
  }, []);

  // new chat
  const handleNewChat = useCallback((id: CharacterId) => {
    const display = getDisplayChar(id);
    if (!window.confirm(`确定要开始和${display.name}的新对话吗？旧对话将被清除，记忆保留。`)) return;
    setMessagesByChar((prev) => ({ ...prev, [id]: [] }));
    if (id !== activeId) setActiveId(id);
  }, [activeId, getDisplayChar]);

  // export chat
  const handleExportChat = useCallback(() => {
    const allChars = [...PRESET_CHARACTERS, ...customChars];
    let text = '';
    allChars.forEach((char) => {
      const msgs = messagesByChar[char.id] || [];
      if (msgs.length === 0) return;
      const mem = memoryByChar[char.id];
      text += `===== ${char.name}（${char.title || '自定义'}）=====\n`;
      if (mem?.conversationSummary) text += `摘要：${mem.conversationSummary}\n`;
      text += `消息数：${msgs.length}\n\n`;
      msgs.forEach((m) => {
        const t = new Date(m.timestamp).toLocaleString('zh-CN', { hour12: false });
        text += `[${t}] ${m.role === 'user' ? '用户' : char.name}：${m.content.replace(/^(TRANSFER_CARD|SHOP_CARD|FOOD_CARD|PHOTO_CARD):/, '[$1] ')}\n`;
      });
    });
    if (!text) { alert('暂无聊天记录可导出'); return; }
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [messagesByChar, memoryByChar, customChars]);

  const displayChar = getDisplayChar(activeId);
  const activeMessages = messagesByChar[activeId] || [];
  const activeMemory = memoryByChar[activeId];

  return (
    <div className="chat-layout">
      <Sidebar
        presetChars={PRESET_CHARACTERS}
        customChars={customChars}
        activeId={activeId}
        onSelect={handleCharacterSwitch}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSettings={(charId) => setModalMode({ type: 'edit', charId })}
        onCreateCharacter={() => setModalMode({ type: 'create' })}
        onDeleteCharacter={handleDeleteCharacter}
        avatarOverrides={avatarOverrides}
        isVip={isVip}
        onUpgrade={() => { setUpgradeCharName('VIP 升级'); setShowUpgrade(true); }}
        onExport={handleExportChat}
      />
      <ChatWindow
        character={displayChar}
        messages={activeMessages}
        onSend={handleSend}
        isLoading={isLoading}
        memory={activeMemory}
        onNewChat={() => handleNewChat(activeId)}
        onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSettings={() => setModalMode({ type: 'edit', charId: activeId })}
      />
      {modalMode && (
        <SettingsModal
          mode={modalMode.type}
          character={modalMode.type === 'edit' ? (getDisplayChar(modalMode.charId) ?? undefined) : undefined}
          onSave={modalMode.type === 'edit' ? handleSaveSettings : handleCreateCharacter}
          onClose={() => setModalMode(null)}
          onDelete={modalMode.type === 'edit' && !isPresetCharacter(modalMode.charId as any)
            ? () => { handleDeleteCharacter(modalMode.charId); setModalMode(null); }
            : undefined}
        />
      )}
      {showUpgrade && (
        <InviteCodeModal
          charName={upgradeCharName}
          onUpgrade={handleUpgrade}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}

function safeParse(raw: string | null): any {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeParseArray(raw: string | null): any[] | null {
  const v = safeParse(raw);
  return Array.isArray(v) ? v : null;
}