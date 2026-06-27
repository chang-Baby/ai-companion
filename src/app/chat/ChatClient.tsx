'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CharacterId, Message, Memory, DisplayCharacter, CustomCharacter, ChatSettings } from '../data/types';
import { PRESET_CHARACTERS, getPresetCharacter, isPresetCharacter, customToConfig, toDisplay } from '../data/characters';
import { createDefaultMemory } from '../data/memory-defaults';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';

// localStorage key 常量
const KEY_CHAT = (id: string) => `companion_chat_${id}`;
const KEY_MEMORY = (id: string) => `companion_memory_${id}`;
const KEY_CUSTOM_CHARS = 'companion_custom_chars';
const KEY_AVATARS = 'companion_avatars';
const KEY_ACTIVE = 'companion_active';

// 旧数据迁移
const OLD_NAME_TO_ID: Record<string, string> = {
  '星尘': 'xingchen',
  '墨离': 'moli',
  '云曦': 'yunxi',
};

interface ChatClientProps {
  initialCharacterId: CharacterId;
  initialSettings: ChatSettings;
}

type ModalMode = { type: 'edit'; charId: CharacterId } | { type: 'create' } | null;

export default function ChatClient({ initialCharacterId, initialSettings }: ChatClientProps) {
  const [activeId, setActiveId] = useState<CharacterId>(initialCharacterId);
  const [messagesByChar, setMessagesByChar] = useState<Record<string, Message[]>>({});
  const [memoryByChar, setMemoryByChar] = useState<Record<string, Memory>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // 自定义角色列表
  const [customChars, setCustomChars] = useState<CustomCharacter[]>([]);
  // 头像覆盖（per character ID）: id -> avatar url/base64
  const [avatarOverrides, setAvatarOverrides] = useState<Record<string, string>>({});

  const messageCountRef = useRef<Record<string, number>>({});

  // 获取所有角色（预设 + 自定义）
  const allCharacters = [...PRESET_CHARACTERS, ...customChars.map(customToConfig)];

  // 初始化
  useEffect(() => {
    const initMsgs: Record<string, Message[]> = {};
    const initMems: Record<string, Memory> = {};
    const initCounts: Record<string, number> = {};
    const initAvatars: Record<string, string> = {};

    // 迁移旧数据
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

    // 加载所有预设角色数据
    PRESET_CHARACTERS.forEach((char) => {
      const saved = localStorage.getItem(KEY_CHAT(char.id));
      initMsgs[char.id] = safeParseArray(saved)?.slice(-500) || [];
      initMems[char.id] = safeParse(localStorage.getItem(KEY_MEMORY(char.id))) || createDefaultMemory();
      initCounts[char.id] = initMsgs[char.id].length;
    });

    // 加载自定义角色
    const savedCustom = localStorage.getItem(KEY_CUSTOM_CHARS);
    const parsedCustom: CustomCharacter[] = safeParseArray(savedCustom) || [];
    setCustomChars(parsedCustom);

    parsedCustom.forEach((cc) => {
      const saved = localStorage.getItem(KEY_CHAT(cc.id));
      initMsgs[cc.id] = safeParseArray(saved)?.slice(-500) || [];
      initMems[cc.id] = safeParse(localStorage.getItem(KEY_MEMORY(cc.id))) || createDefaultMemory();
      initCounts[cc.id] = initMsgs[cc.id].length;
    });

    // 加载头像覆盖
    const savedAvatars = localStorage.getItem(KEY_AVATARS);
    if (savedAvatars) {
      try { Object.assign(initAvatars, JSON.parse(savedAvatars)); } catch {}
    }

    // URL 带来自定义头像时合并进去
    if (initialSettings.avatar) {
      initAvatars[initialCharacterId] = initialSettings.avatar;
    }

    setMessagesByChar(initMsgs);
    setMemoryByChar(initMems);
    setAvatarOverrides(initAvatars);
    messageCountRef.current = initCounts;

    const savedActive = localStorage.getItem(KEY_ACTIVE);
    if (savedActive) setActiveId(savedActive);
  }, []);

  // 持久化
  useEffect(() => {
    Object.entries(messagesByChar).forEach(([id, msgs]) => {
      localStorage.setItem(KEY_CHAT(id), JSON.stringify(msgs.slice(-500)));
    });
    Object.entries(memoryByChar).forEach(([id, mem]) => {
      localStorage.setItem(KEY_MEMORY(id), JSON.stringify(mem));
    });
    localStorage.setItem(KEY_ACTIVE, activeId);
  }, [messagesByChar, memoryByChar, activeId]);

  useEffect(() => {
    localStorage.setItem(KEY_CUSTOM_CHARS, JSON.stringify(customChars));
  }, [customChars]);

  useEffect(() => {
    localStorage.setItem(KEY_AVATARS, JSON.stringify(avatarOverrides));
  }, [avatarOverrides]);

  // 获取显示角色
  const getDisplayChar = useCallback(
    (id: string): DisplayCharacter => {
      // 先查预设
      if (isPresetCharacter(id)) {
        return toDisplay(getPresetCharacter(id), avatarOverrides[id]);
      }
      // 再查自定义
      const cc = customChars.find((c) => c.id === id);
      if (cc) {
        return toDisplay(customToConfig(cc), avatarOverrides[id]);
      }
      // fallback
      return toDisplay(getPresetCharacter('xingchen'));
    },
    [customChars, avatarOverrides]
  );

  // 保存设定（编辑模式）
  const handleSaveSettings = useCallback(
    (settings: { avatar: string }) => {
      setAvatarOverrides((prev) => ({ ...prev, [activeId]: settings.avatar }));
      setModalMode(null);
    },
    [activeId]
  );

  // 创建自定义角色
  const handleCreateCharacter = useCallback((cc: CustomCharacter) => {
    const id = `custom_${Date.now()}`;
    const newChar: CustomCharacter = { ...cc, id, createdAt: new Date().toISOString() };
    setCustomChars((prev) => [...prev, newChar]);
    setMessagesByChar((prev) => ({ ...prev, [id]: [] }));
    setMemoryByChar((prev) => ({ ...prev, [id]: createDefaultMemory() }));
    if (cc.avatar) {
      const av = cc.avatar;
      setAvatarOverrides((prev) => ({ ...prev, [id]: av }));
    }
    setActiveId(id);
    setModalMode(null);
  }, []);

  // 删除自定义角色
  const handleDeleteCharacter = useCallback((id: string) => {
    setCustomChars((prev) => prev.filter((c) => c.id !== id));
    setMessagesByChar((prev) => { const n = { ...prev }; delete n[id]; return n as Record<string, Message[]>; });
    setMemoryByChar((prev) => { const n = { ...prev }; delete n[id]; return n as Record<string, Memory>; });
    setAvatarOverrides((prev) => { const next = { ...prev }; delete next[id]; return next as Record<string, string>; });
    localStorage.removeItem(KEY_CHAT(id));
    localStorage.removeItem(KEY_MEMORY(id));
    if (activeId === id) setActiveId('xingchen');
  }, [activeId]);

  // 发送消息
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
        if (data.content) {
          const assistantMsg: Message = { role: 'assistant', content: data.content, timestamp: new Date().toISOString() };
          setMessagesByChar((prev) => ({ ...prev, [activeId]: [...updatedMessages, assistantMsg] }));
          const newCount = (messageCountRef.current[activeId] || 0) + 2;
          messageCountRef.current = { ...messageCountRef.current, [activeId]: newCount };
          if (newCount % 6 === 0) {
            triggerMemoryAnalysis(activeId, [...updatedMessages, assistantMsg], updatedMem);
          }
        }
      } catch (err) { console.error('发送失败:', err); }
      finally { setIsLoading(false); }
    },
    [activeId, messagesByChar, memoryByChar, getDisplayChar]
  );

  async function triggerMemoryAnalysis(charId: string, msgs: Message[], mem: Memory) {
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: msgs.slice(-20), existingMemory: mem, characterId: charId }),
      });
      const data = await res.json();
      if (data.memory) setMemoryByChar((prev) => ({ ...prev, [charId]: data.memory }));
    } catch {}
  }

  const handleCharacterSwitch = useCallback((id: CharacterId) => {
    setActiveId(id);
    setSidebarCollapsed(true);
  }, []);

  const handleNewChat = useCallback((id: CharacterId) => {
    const display = getDisplayChar(id);
    if (!window.confirm(`确定要开始和${display.name}的新对话吗？旧对话将被清除，记忆保留。`)) return;
    setMessagesByChar((prev) => ({ ...prev, [id]: [] }));
    if (id !== activeId) setActiveId(id);
  }, [activeId, getDisplayChar]);

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
          onDelete={modalMode.type === 'edit' && !isPresetCharacter(modalMode.charId)
            ? () => { handleDeleteCharacter(modalMode.charId); setModalMode(null); }
            : undefined}
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