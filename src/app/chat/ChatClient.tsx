'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CharacterConfig,
  CharacterId,
  Message,
  Memory,
} from '@/app/data/types';
import { CHARACTERS, getCharacter } from '@/app/data/characters';
import { createDefaultMemory } from '@/app/data/memory-defaults';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';

// 自定义角色设定（从 URL 传入）
export interface ChatSettings {
  isCustom: boolean;
  customName: string;
  customDesc: string;
  customStyleDesc: string;
  avatar: string;    // URL 或 base64
  style: string;
}

// 扩展角色信息，包含自定义覆盖
export interface DisplayCharacter extends CharacterConfig {
  displayName: string;
  displayAvatar: string;  // emoji, URL, 或 base64
  displayDescription: string;
  displayStyleDesc: string;
  isCustom: boolean;
  customDesc: string;
}

interface ChatClientProps {
  initialCharacterId: CharacterId;
  initialSettings: ChatSettings;
}

// 旧 key 到新 key 的映射（用于数据迁移）
const OLD_NAME_TO_ID: Record<string, CharacterId> = {
  '星尘': 'xingchen',
  '墨离': 'moli',
  '云曦': 'yunxi',
};

// 构建显示用的角色信息
function buildDisplayChar(charId: CharacterId, settings: ChatSettings): DisplayCharacter {
  const base = getCharacter(charId);
  if (settings.isCustom) {
    return {
      ...base,
      displayName: settings.customName || base.name,
      displayAvatar: settings.avatar || base.emoji,
      displayDescription: settings.customDesc || base.description,
      displayStyleDesc: settings.customStyleDesc || settings.style || base.styleDesc,
      isCustom: true,
      customDesc: settings.customDesc || '',
    };
  }
  return {
    ...base,
    displayName: base.name,
    displayAvatar: settings.avatar || base.emoji,
    displayDescription: base.description,
    displayStyleDesc: base.styleDesc,
    isCustom: false,
    customDesc: '',
  };
}

export default function ChatClient({ initialCharacterId, initialSettings }: ChatClientProps) {
  const [activeId, setActiveId] = useState<CharacterId>(initialCharacterId);
  const [messagesByChar, setMessagesByChar] = useState<
    Record<CharacterId, Message[]>
  >({} as Record<CharacterId, Message[]>);
  const [memoryByChar, setMemoryByChar] = useState<
    Record<CharacterId, Memory>
  >({} as Record<CharacterId, Memory>);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // 存储自定义设定（从首页传入的）
  const [customSettingsByChar, setCustomSettingsByChar] = useState<
    Record<CharacterId, ChatSettings>
  >({} as Record<CharacterId, ChatSettings>);

  const messageCountRef = useRef<Record<CharacterId, number>>(
    {} as Record<CharacterId, number>
  );

  // 初始化
  useEffect(() => {
    const initialMessages: Record<CharacterId, Message[]> = {} as Record<
      CharacterId, Message[]
    >;
    const initialMemories: Record<CharacterId, Memory> = {} as Record<
      CharacterId, Memory
    >;
    const initialCounts: Record<CharacterId, number> = {} as Record<
      CharacterId, number
    >;
    const initialCustom: Record<CharacterId, ChatSettings> = {} as Record<
      CharacterId, ChatSettings
    >;

    CHARACTERS.forEach((char) => {
      migrateOldData(char.id, char.name);

      const savedMessages = localStorage.getItem(`companion_chat_${char.id}`);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          initialMessages[char.id] = Array.isArray(parsed) ? parsed.slice(-500) : [];
        } catch {
          initialMessages[char.id] = [];
        }
      } else {
        initialMessages[char.id] = [];
      }

      const savedMemory = localStorage.getItem(`companion_memory_${char.id}`);
      if (savedMemory) {
        try {
          initialMemories[char.id] = JSON.parse(savedMemory);
        } catch {
          initialMemories[char.id] = createDefaultMemory();
        }
      } else {
        initialMemories[char.id] = createDefaultMemory();
      }

      initialCounts[char.id] = initialMessages[char.id].length;

      // 加载自定义设定
      const savedSettings = localStorage.getItem(`companion_settings_${char.id}`);
      if (savedSettings) {
        try {
          initialCustom[char.id] = JSON.parse(savedSettings);
        } catch {
          initialCustom[char.id] = initialSettings;
        }
      }
    });

    // 当前角色设定：localStorage 优先，URL 参数作为 fallback
    if (!initialCustom[initialCharacterId]) {
      initialCustom[initialCharacterId] = initialSettings;
    } else if (initialSettings.avatar || initialSettings.isCustom) {
      // URL 带了新设定（从首页自定义来的），合并进去
      initialCustom[initialCharacterId] = {
        ...initialCustom[initialCharacterId],
        ...initialSettings,
        avatar: initialSettings.avatar || initialCustom[initialCharacterId].avatar,
      };
    }

    setMessagesByChar(initialMessages);
    setMemoryByChar(initialMemories);
    setCustomSettingsByChar(initialCustom);
    messageCountRef.current = initialCounts;

    const savedActive = localStorage.getItem('companion_active');
    if (savedActive && CHARACTERS.some((c) => c.id === savedActive)) {
      setActiveId(savedActive as CharacterId);
    }
  }, []);

  // 保存自定义设定
  useEffect(() => {
    if (Object.keys(customSettingsByChar).length === 0) return;
    CHARACTERS.forEach((char) => {
      const settings = customSettingsByChar[char.id];
      if (settings) {
        localStorage.setItem(
          `companion_settings_${char.id}`,
          JSON.stringify(settings)
        );
      }
    });
  }, [customSettingsByChar]);

  // 旧数据迁移
  function migrateOldData(newId: CharacterId, name: string) {
    const oldChatKey = `companion_chat_${name}`;
    const oldTopicKey = `companion_topic_${name}`;
    const newChatKey = `companion_chat_${newId}`;

    if (!localStorage.getItem(newChatKey)) {
      const oldChat = localStorage.getItem(oldChatKey);
      if (oldChat) {
        localStorage.setItem(newChatKey, oldChat);
      }
      const mappedId = OLD_NAME_TO_ID[name];
      if (mappedId && mappedId !== newId) {
        const mappedChatKey = `companion_chat_${mappedId}`;
        const mappedChat = localStorage.getItem(mappedChatKey);
        if (mappedChat && !localStorage.getItem(newChatKey)) {
          localStorage.setItem(newChatKey, mappedChat);
        }
      }
    }

    const oldTopic = localStorage.getItem(oldTopicKey);
    if (oldTopic) {
      const memoryKey = `companion_memory_${newId}`;
      const existingMemory = localStorage.getItem(memoryKey);
      const memory = existingMemory
        ? JSON.parse(existingMemory)
        : createDefaultMemory();
      if (!memory.conversationSummary) {
        memory.conversationSummary = oldTopic;
        localStorage.setItem(memoryKey, JSON.stringify(memory));
      }
    }
  }

  // 保存数据到 localStorage
  useEffect(() => {
    if (Object.keys(messagesByChar).length === 0) return;
    CHARACTERS.forEach((char) => {
      const msgs = messagesByChar[char.id];
      if (msgs && msgs.length > 0) {
        localStorage.setItem(
          `companion_chat_${char.id}`,
          JSON.stringify(msgs.slice(-500))
        );
      }
      const mem = memoryByChar[char.id];
      if (mem) {
        localStorage.setItem(
          `companion_memory_${char.id}`,
          JSON.stringify(mem)
        );
      }
    });
    localStorage.setItem('companion_active', activeId);
  }, [messagesByChar, memoryByChar, activeId]);

  // 获取当前显示角色
  const getDisplayChar = useCallback(
    (id: CharacterId): DisplayCharacter => {
      const settings = customSettingsByChar[id] || initialSettings;
      return buildDisplayChar(id, settings);
    },
    [customSettingsByChar, initialSettings]
  );

  // 发送消息
  const handleSend = useCallback(
    async (content: string) => {
      const base = getCharacter(activeId);
      const display = getDisplayChar(activeId);
      const currentMessages = messagesByChar[activeId] || [];
      const currentMemory = memoryByChar[activeId] || createDefaultMemory();

      const userMsg: Message = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      const updatedMessages = [...currentMessages, userMsg];
      setMessagesByChar((prev) => ({
        ...prev,
        [activeId]: updatedMessages,
      }));

      // 本地更新记忆
      const today = new Date().toISOString().split('T')[0];
      const updatedMemoryLocally = { ...currentMemory };
      updatedMemoryLocally.totalChatTime += 1;
      updatedMemoryLocally.lastUpdated = new Date().toISOString();

      const todayCheckIn = updatedMemoryLocally.dailyCheckIns.find(
        (c) => c.date === today
      );
      if (todayCheckIn) {
        todayCheckIn.messageCount += 2;
        todayCheckIn.duration += 1;
      } else {
        updatedMemoryLocally.dailyCheckIns.push({
          date: today,
          duration: 1,
          messageCount: 2,
          topics: [],
          mood: 'neutral',
        });
      }
      if (updatedMemoryLocally.dailyCheckIns.length > 90) {
        updatedMemoryLocally.dailyCheckIns =
          updatedMemoryLocally.dailyCheckIns.slice(-90);
      }

      setMemoryByChar((prev) => ({
        ...prev,
        [activeId]: updatedMemoryLocally,
      }));

      // 调用 API
      setIsLoading(true);
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: updatedMessages,
            settings: {
              characterId: base.id,
              name: display.displayName,
              personality: base.personality,
              styleDesc: display.displayStyleDesc,
              memory: updatedMemoryLocally,
            },
          }),
        });

        const data = await response.json();

        if (data.content) {
          const assistantMsg: Message = {
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toISOString(),
          };

          const finalMessages = [...updatedMessages, assistantMsg];
          setMessagesByChar((prev) => ({
            ...prev,
            [activeId]: finalMessages,
          }));

          const newCount = (messageCountRef.current[activeId] || 0) + 2;
          messageCountRef.current = {
            ...messageCountRef.current,
            [activeId]: newCount,
          };

          if (newCount % 6 === 0) {
            triggerMemoryAnalysis(activeId, finalMessages, updatedMemoryLocally);
          }
        }
      } catch (error) {
        console.error('发送消息失败:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [activeId, messagesByChar, memoryByChar, getDisplayChar]
  );

  // 触发记忆分析
  async function triggerMemoryAnalysis(
    charId: CharacterId,
    messages: Message[],
    currentMemory: Memory
  ) {
    try {
      const recentMessages = messages.slice(-20);
      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: recentMessages,
          existingMemory: currentMemory,
          characterId: charId,
        }),
      });

      const data = await response.json();
      if (data.memory) {
        setMemoryByChar((prev) => ({
          ...prev,
          [charId]: data.memory,
        }));
      }
    } catch (error) {
      console.error('记忆分析失败:', error);
    }
  }

  // 切换角色
  const handleCharacterSwitch = useCallback(
    (id: CharacterId, settings?: ChatSettings) => {
      setActiveId(id);
      setSidebarCollapsed(true);
      if (settings) {
        setCustomSettingsByChar((prev) => ({ ...prev, [id]: settings }));
      }
    },
    []
  );

  // 新建对话
  const handleNewChat = useCallback(
    (id: CharacterId) => {
      const display = getDisplayChar(id);
      const ok = window.confirm(
        `确定要开始和${display.displayName}的新对话吗？旧对话记录将被清除，但长期记忆会保留。`
      );
      if (!ok) return;

      setMessagesByChar((prev) => ({
        ...prev,
        [id]: [],
      }));

      setMemoryByChar((prev) => {
        const oldMem = prev[id] || createDefaultMemory();
        const newMem = createDefaultMemory();
        newMem.keyFacts = oldMem.keyFacts || [];
        newMem.userGoals = oldMem.userGoals || [];
        newMem.totalChatTime = oldMem.totalChatTime || 0;
        newMem.studyHours = oldMem.studyHours || 0;
        newMem.weakSubjects = oldMem.weakSubjects || [];
        newMem.examDate = oldMem.examDate;
        return { ...prev, [id]: newMem };
      });

      messageCountRef.current = {
        ...messageCountRef.current,
        [id]: 0,
      };

      if (id !== activeId) {
        setActiveId(id);
      }
    },
    [activeId, getDisplayChar]
  );

  // 保存设定
  const handleSaveSettings = useCallback(
    (settings: ChatSettings) => {
      setCustomSettingsByChar((prev) => ({ ...prev, [activeId]: settings }));
      setShowSettings(false);
    },
    [activeId]
  );

  const displayChar = getDisplayChar(activeId);
  const activeMessages = messagesByChar[activeId] || [];
  const activeMemory = memoryByChar[activeId];

  return (
    <div className="chat-layout">
      <Sidebar
        characters={CHARACTERS}
        activeId={activeId}
        onSelect={handleCharacterSwitch}
        onNewChat={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((prev) => !prev)}
        getDisplayChar={getDisplayChar}
        onOpenSettings={() => setShowSettings(true)}
      />
      <ChatWindow
        character={displayChar}
        messages={activeMessages}
        onSend={handleSend}
        isLoading={isLoading}
        memory={activeMemory}
        onNewChat={() => handleNewChat(activeId)}
        onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSettings={() => setShowSettings(true)}
      />
      {showSettings && (
        <SettingsModal
          character={displayChar}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}