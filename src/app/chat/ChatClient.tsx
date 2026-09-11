'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { CharacterId, Message, Memory, DisplayCharacter, CustomCharacter, ChatSettings, ChatTheme } from '../data/types';
import { PRESET_CHARACTERS, getPresetCharacter, isPresetCharacter, customToConfig, toDisplay } from '../data/characters';
import { createDefaultMemory } from '../data/memory-defaults';
import { BG_PRESETS, BUBBLE_PRESETS } from '../data/themes';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import SettingsModal from './components/SettingsModal';
import InviteCodeModal from './components/InviteCodeModal';
import EmotionCamera, { MOOD_FRESH_MS } from './components/EmotionCamera';
import ProactivePopup from './components/ProactivePopup';
import AppearancePanel from './components/AppearancePanel';

// localStorage keys
const KEY_CHAT = (id: string) => `companion_chat_${id}`;
const KEY_MEMORY = (id: string) => `companion_memory_${id}`;
const KEY_CUSTOM_CHARS = 'companion_custom_chars';
const KEY_AVATARS = 'companion_avatars';
const KEY_ACTIVE = 'companion_active';
const KEY_SESSION = 'auth_session';
const KEY_VIP = 'auth_vip';
const KEY_THEME = 'companion_theme';
const KEY_LAST_OPEN = 'companion_last_open';
const KEY_MEM_FOLLOWED = 'companion_mem_followed';

// 主动对话（由头触发，绝不是定时器）
const PROACTIVE_MIN_GAP = 25 * 60 * 1000;   // 两次主动开口最小间隔：25 分钟
const PROACTIVE_CHANCE = 0.35;              // 由头出现后随机开口概率：35%
const IDLE_MS = 10 * 60 * 1000;             // 开着页面发呆 10 分钟
const RETURNING_MS = 20 * 60 * 60 * 1000;   // 离开超过 20 小时算"久别"
const PROACTIVE_POPUP_MS = 12000;           // 通知弹窗自动收起时间

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

  // 外观主题（背景 + 气泡，本地保存）
  const [theme, setTheme] = useState<ChatTheme>({ bg: 'night', bubble: 'ink' });
  const [showAppearance, setShowAppearance] = useState(false);

  // 主动消息通知弹窗（像朋友弹来的消息，不是静默加列表）
  const [proactivePopup, setProactivePopup] = useState<{ charId: string; content: string } | null>(null);

  const messageCountRef = useRef<Record<string, number>>({});
  const faceMoodRef = useRef<string | null>(null);
  const faceMoodAtRef = useRef<number>(0);
  // 摄像头实时识别到的表情（展示在情绪胶囊上；是否告诉 AI 由用户决定）
  const [faceMoodState, setFaceMoodState] = useState<string | null>(null);
  const lastProactiveAtRef = useRef(0);     // 上次主动开口时间（统一冷却）
  const proactiveRunningRef = useRef(false);
  const isLoadingRef = useRef(false);
  isLoadingRef.current = isLoading;
  // 由头触发系统：记录用户最后活动时间、离开页面时间
  const lastActivityAtRef = useRef(Date.now());
  const lastHiddenAtRef = useRef<number>(0);

  // 主动开口：由头（reason）只决定"何时开口"，说什么完全由 AI 结合人设+记忆+上下文现生成
  const triggerProactive = useCallback(async (reason: string) => {
    const charId = activeIdRef.current;
    const display = getDisplayCharRef.current(charId);
    const mem = memoryByCharRef.current[charId] || createDefaultMemory();
    const history = messagesByCharRef.current[charId] || [];
    const mood = faceMoodRef.current && Date.now() - faceMoodAtRef.current < MOOD_FRESH_MS
      ? faceMoodRef.current
      : null;

    setIsLoading(true);
    proactiveRunningRef.current = true;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localStorage.getItem('auth_token') || '',
          messages: history.slice(-20),
          settings: {
            characterId: display.id,
            name: display.name,
            personality: display.personality,
            styleDesc: display.styleDesc,
            description: display.description,
            style: display.isPreset ? 'gentle' : 'custom',
            memory: mem,
            faceMood: mood,
            proactive: true,
            proactiveReason: reason,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.content) {
        const careMsg: Message = {
          role: 'assistant',
          content: data.content,
          timestamp: new Date().toISOString(),
          proactive: true,
        };
        setMessagesByChar((prev) => ({ ...prev, [charId]: [...(prev[charId] || []), careMsg] }));
        if (data.remaining !== undefined) {
          setQuotaByChar((prev) => ({ ...prev, [charId]: data.remaining }));
        }
        // 像朋友弹来的消息一样弹出通知，而不是静默躺在列表里
        setProactivePopup({ charId, content: data.content });
      }
    } catch {
      // 静默失败，不打扰用户
    } finally {
      setIsLoading(false);
      proactiveRunningRef.current = false;
    }
  }, []);

  // 统一闸门：冷却 + 不打断打字/回复 + 页面要可见 + 随机概率（情绪由头最紧急，跳过概率）
  const attemptProactive = useCallback((reason: string, opts?: { skipChance?: boolean }) => {
    const now = Date.now();
    if (proactiveRunningRef.current) return false;
    if (isLoadingRef.current) return false;               // AI 正在回复，不插嘴
    if (now - lastProactiveAtRef.current < PROACTIVE_MIN_GAP) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    const input = document.querySelector<HTMLTextAreaElement>('.chat-input');
    if (input && input.value.trim()) return false;        // 用户正在打字，不打扰
    if (!opts?.skipChance && Math.random() > PROACTIVE_CHANCE) return false;
    lastProactiveAtRef.current = now;
    lastActivityAtRef.current = now;
    triggerProactive(reason);
    return true;
  }, [triggerProactive]);

  // 记忆旧事扫描：在长期记忆里找"今天该跟进"的线索（面试/考试/出成绩等日期相关事件）
  const findMemoryFollowup = useCallback((charId: string): string | null => {
    const mem = memoryByCharRef.current[charId];
    if (!mem) return null;
    const todayStr = new Date().toISOString().slice(0, 10);
    let followed: Record<string, string> = {};
    try { followed = JSON.parse(localStorage.getItem(KEY_MEM_FOLLOWED) || '{}'); } catch { followed = {}; }
    const candidates = [...(mem.keyFacts || []), ...(mem.userGoals || [])];
    const weekWords = ['周一', '周二', '周三', '周四', '周五', '周六', '周日', '周内', '周末'];
    for (const text of candidates) {
      const lower = text.toLowerCase();
      const hitDate =
        (text.includes('今天') || text.includes(todayStr) || text.includes(todayStr.slice(5))) ||
        text.includes('明天') || text.includes('后天') ||
        weekWords.some((w) => text.includes(w));
      const hitEvent = /面试|考试|出成绩|答辩|比赛|体检|报名|截止|约了|复诊|回家|开学|报到|入职/.test(text);
      if (hitEvent && (hitDate || /\d{1,2}\s*月\s*\d{0,2}/.test(text))) {
        const key = `${todayStr}:${text.slice(0, 12)}`;
        if (followed[key]) continue;  // 今天已跟进过，不重复
        followed[key] = new Date().toISOString();
        try {
          const cleaned = Object.fromEntries(Object.entries(followed).filter(([k]) => k.startsWith(todayStr) || k.startsWith(new Date(Date.now() - 86400000).toISOString().slice(0, 10))));
          localStorage.setItem(KEY_MEM_FOLLOWED, JSON.stringify(cleaned));
        } catch {}
        return text.slice(0, 40);
      }
    }
    return null;
  }, []);

  // 摄像头只负责"看见"：更新状态胶囊，绝不在背后替用户决定何时表达
  const handleFaceMood = useCallback((label: string | null) => {
    faceMoodRef.current = label;
    faceMoodAtRef.current = label ? Date.now() : 0;
    setFaceMoodState(label);
  }, []);

  // 用户主动把"此刻心情"递给 TA：用户点了按钮，这就是用户在说话
  // 与正常发消息一样进入对话（带"主动"标识、走弹窗通知），但不受概率/冷却限制
  const handleShareMood = useCallback((label: string): boolean => {
    if (proactiveRunningRef.current || isLoadingRef.current) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    triggerProactive(`mood:${label}`);
    return true;
  }, [triggerProactive]);

  // 供回调读取最新状态（避免闭包旧值）
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const messagesByCharRef = useRef(messagesByChar);
  messagesByCharRef.current = messagesByChar;
  const memoryByCharRef = useRef(memoryByChar);
  memoryByCharRef.current = memoryByChar;

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

    // 外观主题
    try {
      const t = JSON.parse(localStorage.getItem(KEY_THEME) || 'null');
      if (t && typeof t.bg === 'string' && typeof t.bubble === 'string') setTheme(t);
    } catch {}
  }, []);

  // persist
  useEffect(() => {
    Object.entries(messagesByChar).forEach(([id, msgs]) => localStorage.setItem(KEY_CHAT(id), JSON.stringify(msgs.slice(-500))));
    Object.entries(memoryByChar).forEach(([id, mem]) => localStorage.setItem(KEY_MEMORY(id), JSON.stringify(mem)));
    localStorage.setItem(KEY_ACTIVE, activeId);
  }, [messagesByChar, memoryByChar, activeId]);

  useEffect(() => { localStorage.setItem(KEY_CUSTOM_CHARS, JSON.stringify(customChars)); }, [customChars]);
  useEffect(() => { localStorage.setItem(KEY_AVATARS, JSON.stringify(avatarOverrides)); }, [avatarOverrides]);
  useEffect(() => { try { localStorage.setItem(KEY_THEME, JSON.stringify(theme)); } catch {} }, [theme]);

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

  // getDisplayChar 的 ref 版（供主动关怀等异步回调读取最新值）
  const getDisplayCharRef = useRef(getDisplayChar);
  getDisplayCharRef.current = getDisplayChar;

  /* ============ 主动对话·由头监听系统 ============
     真人从不准点发消息——每个主动开口都必须有"由头"：
     发呆 / 切页回来 / 久别回归 / 深夜 / 记忆里的旧事 / 摄像头看到情绪。
     由头出现后过随机概率闸门 + 最小间隔，内容仍由 AI 结合人设与记忆现生成。 */
  useEffect(() => {
    const markOpen = () => { try { localStorage.setItem(KEY_LAST_OPEN, String(Date.now())); } catch {} };

    // 用户在页面上的任何活动都刷新"发呆计时"
    const bump = () => { lastActivityAtRef.current = Date.now(); };
    const activityEvents = ['pointermove', 'keydown', 'click', 'touchstart', 'wheel'];
    activityEvents.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

    // 切页 / 切回
    const onVisibility = () => {
      if (document.hidden) {
        lastHiddenAtRef.current = Date.now();
        markOpen();
        return;
      }
      const awayMs = Date.now() - (lastHiddenAtRef.current || Date.now());
      const awayMin = Math.max(1, Math.round(awayMs / 60000));
      lastActivityAtRef.current = Date.now();
      // 回来后等 7 秒：用户如果马上开始打字，闸门会自动拦住
      setTimeout(() => {
        const hour = new Date().getHours();
        const isLateNight = hour >= 0 && hour < 5;
        if (awayMs > RETURNING_MS) {
          attemptProactive(`returning:${awayMin}`);
        } else if (isLateNight && awayMin >= 15) {
          attemptProactive('late_night');
        } else if (awayMin >= 20 && awayMin <= 180) {
          attemptProactive(`tab_back:${awayMin}`);
        } else {
          const hit = findMemoryFollowup(activeIdRef.current);
          if (hit) attemptProactive(`memory:${hit}`);
        }
      }, 7000);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', markOpen);

    // 每分钟巡检：发呆 10 分钟 / 深夜还在 / 记忆旧事
    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const hour = new Date().getHours();
      const idleMin = (now - lastActivityAtRef.current) / 60000;
      if (idleMin >= 10) {
        attemptProactive('idle');
      } else if (hour >= 0 && hour < 5 && idleMin >= 5) {
        attemptProactive('late_night');
      } else if (idleMin >= 3) {
        const hit = findMemoryFollowup(activeIdRef.current);
        if (hit) attemptProactive(`memory:${hit}`);
      }
    }, 60000);

    // 打开页面时：隔了很久回来（>20 小时），8 秒后自然地打个招呼
    let mountTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const last = Number(localStorage.getItem(KEY_LAST_OPEN) || 0);
      const awayMin = last ? Math.round((Date.now() - last) / 60000) : 0;
      if (awayMin > RETURNING_MS / 60000) {
        mountTimer = setTimeout(() => attemptProactive(`returning:${awayMin}`), 8000);
      }
      markOpen();
    } catch {}

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, bump));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', markOpen);
      clearInterval(timer);
      if (mountTimer) clearTimeout(mountTimer);
      markOpen();
    };
  }, [attemptProactive, findMemoryFollowup]);

  // 主动消息弹窗 12 秒后自动收起（消息已在对话列表里，不丢）
  useEffect(() => {
    if (!proactivePopup) return;
    const t = setTimeout(() => setProactivePopup(null), PROACTIVE_POPUP_MS);
    return () => clearTimeout(t);
  }, [proactivePopup]);

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

      // 用户主动说话了，重置主动开口冷却与发呆计时（正在聊天时不主动插话）
      lastProactiveAtRef.current = Date.now();
      lastActivityAtRef.current = Date.now();

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
              // 心情只在用户主动点"告诉 TA"时传递，打字对话不自动附带情绪
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
        faceMood={faceMoodState}
        theme={theme}
        voice={displayChar.voice && displayChar.voice.length ? displayChar.voice : ['x6_lingxiaoxuan_pro']}
        onNewChat={() => handleNewChat(activeId)}
        onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
        onOpenSettings={() => setModalMode({ type: 'edit', charId: activeId })}
        onOpenAppearance={() => setShowAppearance(true)}
      />
      <EmotionCamera onMood={handleFaceMood} onShareMood={handleShareMood} />
      {proactivePopup && (
        <ProactivePopup
          character={getDisplayChar(proactivePopup.charId)}
          content={proactivePopup.content}
          onOpen={() => {
            setActiveId(proactivePopup.charId as CharacterId);
            setProactivePopup(null);
            setTimeout(() => {
              const el = document.querySelector('.chat-messages');
              el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            }, 100);
          }}
          onClose={() => setProactivePopup(null)}
        />
      )}
      {showAppearance && (
        <AppearancePanel theme={theme} onChange={setTheme} onClose={() => setShowAppearance(false)} />
      )}
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