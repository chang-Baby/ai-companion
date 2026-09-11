'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Message, Memory, DisplayCharacter, ChatTheme } from '../../data/types';
import { BG_PRESETS, BUBBLE_PRESETS } from '../../data/themes';
import MessageBubble from './MessageBubble';
import { PcmRecorder } from './pcm-recorder';
import { speak, stopSpeak } from './tts-player';

interface ChatWindowProps {
  character: DisplayCharacter;
  messages: Message[];
  onSend: (content: string) => void;
  isLoading: boolean;
  memory?: Memory;
  faceMood?: string | null;
  theme: ChatTheme;
  voice?: string[];   // 角色发音人候选链
  onNewChat: () => void;
  onSidebarToggle: () => void;
  onOpenSettings: () => void;
  onOpenAppearance: () => void;
}

const MOOD_META: Record<string, { emoji: string; negative: boolean }> = {
  '平静': { emoji: '😌', negative: false },
  '开心': { emoji: '😊', negative: false },
  '惊讶': { emoji: '😲', negative: false },
  '难过': { emoji: '🥺', negative: true },
  '生气': { emoji: '😠', negative: true },
  '紧张害怕': { emoji: '😨', negative: true },
  '反感': { emoji: '😒', negative: true },
};

// Web Speech API 类型声明
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

function isImageAvatar(avatar: string): boolean {
  return avatar.startsWith('data:') || avatar.startsWith('http') || avatar.startsWith('/');
}

export default function ChatWindow({
  character,
  messages,
  onSend,
  isLoading,
  memory,
  faceMood,
  theme,
  voice,
  onNewChat,
  onSidebarToggle,
  onOpenSettings,
  onOpenAppearance,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);   // 语音朗读开关（默认关闭）
  const [iatReady, setIatReady] = useState<boolean | null>(null); // 讯飞听写是否可用
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const pcmRecorderRef = useRef<PcmRecorder | null>(null);
  const startTextRef = useRef(''); // 录音前 input 的快照
  const spokenRef = useRef('');    // 本次录音已确认的文本
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  // 语音朗读开关：本地记忆
  useEffect(() => {
    try { setVoiceOn(localStorage.getItem('companion_voice') === 'on'); } catch {}
    // 预热浏览器语音列表
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('companion_voice', voiceOn ? 'on' : 'off'); } catch {}
  }, [voiceOn]);

  // 探测讯飞听写服务是否可用（不可用时语音输入自动走浏览器识别）
  useEffect(() => {
    let cancelled = false;
    fetch('/api/iat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio: '' }) })
      .then((r) => { if (!cancelled) setIatReady(r.status !== 503); })
      .catch(() => { if (!cancelled) setIatReady(false); });
    return () => { cancelled = true; };
  }, []);

  // 语音开关开启时：新回复到达自动朗读（只播最新一条，切角色/卸载即停）
  const lastMsgLenRef = useRef(0);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (voiceOn && last?.role === 'assistant' && !isLoading && messages.length > lastMsgLenRef.current) {
      const ts = last.timestamp ? new Date(last.timestamp).getTime() : 0;
      if (Date.now() - ts < 20000) speak(last.content, voiceRef.current);
    }
    lastMsgLenRef.current = messages.length;
  }, [messages, isLoading, voiceOn, voice]);

  useEffect(() => {
    return () => stopSpeak();
  }, []);

  const toggleVoiceOn = useCallback(() => {
    setVoiceOn((on) => {
      if (on) stopSpeak();
      return !on;
    });
  }, []);

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

  /* ---------- 讯飞听写（PCM 录音 → /api/iat）；失败自动降级浏览器识别 ---------- */
  const runXfyunIat = useCallback(async (): Promise<boolean> => {
    const recorder = new PcmRecorder();
    pcmRecorderRef.current = recorder;
    startTextRef.current = input;
    setIsRecording(true);
    await recorder.start(() => {
      // 4 秒静音自动结束
      recorder.stop().then((b64) => {
        pcmRecorderRef.current = null;
        setIsRecording(false);
        if (b64) {
          fetch('/api/iat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: b64 }),
          })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error('iat_fail'))))
            .then((data: { text?: string }) => {
              const t = (data?.text || '').trim();
              if (t) setInput((prev) => (prev ? prev : startTextRef.current) + t);
            })
            .catch(() => { /* 静默失败，浏览器兜底下次再生效 */ });
        }
      });
    });
    return true;
  }, [input]);

  const runBrowserSpeech = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert('你的浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }

    startTextRef.current = input;
    spokenRef.current = '';

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    // 4 秒没说话自动停止
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let processedFinals = 0; // 追踪已处理的 final 结果数量
    let lastInterim = '';
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (lastInterim && !spokenRef.current) spokenRef.current = lastInterim;
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        recognition.stop();
      }, 4000);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      resetSilenceTimer();
      let newFinal = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal && i >= processedFinals) {
          newFinal += r[0]?.transcript || '';
          processedFinals = i + 1;
        } else if (!r.isFinal) {
          interim += r[0]?.transcript || '';
        }
      }
      if (newFinal) spokenRef.current += newFinal;
      lastInterim = interim;
      setInput(startTextRef.current + spokenRef.current + interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setIsRecording(false);
        return;
      }
      console.error('语音识别错误:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (lastInterim && !spokenRef.current) spokenRef.current = lastInterim;
      setInput(startTextRef.current + spokenRef.current);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    setIsRecording(true);
    recognition.start();
    resetSilenceTimer();
  }, [input]);

  // 麦克风按钮：再点一次 = 停止录音
  const toggleVoice = useCallback(async () => {
    if (isRecording) {
      if (pcmRecorderRef.current) {
        const rec = pcmRecorderRef.current;
        pcmRecorderRef.current = null;
        setIsRecording(false);
        const b64 = await rec.stop();
        if (b64) {
          try {
            const res = await fetch('/api/iat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio: b64 }),
            });
            if (res.ok) {
              const data = await res.json();
              const t = (data?.text || '').trim();
              if (t) setInput((prev) => (prev ? prev : startTextRef.current) + t);
            }
          } catch { /* 静默失败 */ }
        }
      } else {
        recognitionRef.current?.stop();
      }
      return;
    }

    // 先申请麦克风权限
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      alert('需要麦克风权限才能使用语音输入，请在浏览器设置中允许麦克风访问');
      return;
    }

    // 讯飞听写可用 → 走讯飞（识别更准）；否则/失败 → 浏览器 Web Speech 兜底
    if (iatReady !== false) {
      try {
        await runXfyunIat();
        return;
      } catch {
        runBrowserSpeech();
      }
    } else {
      runBrowserSpeech();
    }
  }, [isRecording, iatReady, runXfyunIat, runBrowserSpeech]);

  const getMemoryStats = (): string => {
    if (!memory) return '';
    const parts: string[] = [];
    if (memory.totalChatTime > 0) parts.push(`累计陪伴 ${memory.totalChatTime} 分钟`);
    if (memory.keyFacts.length > 0) parts.push(`记住 ${memory.keyFacts.length} 件事`);
    if (memory.dailyCheckIns.length > 0) parts.push(`打卡 ${memory.dailyCheckIns.length} 天`);
    if (character.id === 'weiyang' && memory.studyHours && memory.studyHours > 0) parts.push(`学习 ${memory.studyHours}h`);
    return parts.join(' · ');
  };

  const memoryStats = getMemoryStats();
  const avatarIsImage = isImageAvatar(character.displayAvatar);

  // 外观主题 → CSS 变量（作用于整个聊天区，气泡/背景/强调色统一换肤）
  const bgPreset = BG_PRESETS.find((b) => b.key === theme.bg) || BG_PRESETS[0];
  const bubblePreset = BUBBLE_PRESETS.find((b) => b.key === theme.bubble) || BUBBLE_PRESETS[0];
  const themeVars = {
    ['--chat-bg' as any]: bgPreset.chatBg,
    ['--chat-panel-bg' as any]: bgPreset.panelBg,
    ['--chat-border' as any]: bgPreset.border,
    ['--bubble-user-bg' as any]: bubblePreset.userBg,
    ['--bubble-user-text' as any]: bubblePreset.userText,
    ['--bubble-ai-bg' as any]: bubblePreset.aiBg,
    ['--bubble-ai-text' as any]: bubblePreset.aiText,
    ['--chat-accent' as any]: bubblePreset.accent,
  } as React.CSSProperties;

  return (
    <div className="chat-main" style={themeVars}>
      <div className="chat-header">
        <button className="chat-menu-btn" onClick={onSidebarToggle} title="切换角色">☰</button>
        <div className="chat-header-avatar">
          {avatarIsImage ? <img src={character.displayAvatar} alt={character.name} /> : character.displayAvatar}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{character.name}</div>
          <div className="chat-header-title">{!character.isPreset ? '自定义角色' : character.title}</div>
        </div>
        {memoryStats && <div className="chat-header-memory">{memoryStats}</div>}
        <div className="chat-header-actions">
          <button
            className="chat-new-btn"
            onClick={toggleVoiceOn}
            title={voiceOn ? '关闭角色语音' : '开启后 TA 的新回复会念给你听'}
            style={{ marginLeft: 0, opacity: voiceOn ? 1 : 0.6 }}
          >{voiceOn ? '🔊 语音' : '🔈 语音'}</button>
          <button className="chat-new-btn" onClick={onOpenAppearance} title="换聊天背景和气泡" style={{ marginLeft: 8 }}>🎨 外观</button>
          <button className="chat-new-btn" onClick={onOpenSettings} title="角色设定" style={{ marginLeft: 8 }}>⚙️ 设定</button>
          <button className="chat-new-btn" onClick={onNewChat} title="新建对话" style={{ marginLeft: 8 }}>🔄 新对话</button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="chat-welcome-avatar">
              {avatarIsImage ? <img src={character.displayAvatar} alt={character.name} /> : character.displayAvatar}
            </div>
            <h2 className="chat-welcome-name">你好，我是{character.name}</h2>
            <p className="chat-welcome-title">{!character.isPreset ? '自定义角色' : character.title}</p>
            <p className="chat-welcome-desc">{character.description}</p>
            <p className="chat-welcome-hint">开始和{character.name}对话吧~</p>
          </div>
        ) : (
          messages.map((msg, i) => <MessageBubble key={i} message={msg} character={character} voice={voice} />)
        )}
        {isLoading && (
          <div className="message-row message-row-assistant">
            <div className="message-avatar">
              {avatarIsImage ? <img src={character.displayAvatar} alt={character.name} /> : character.displayAvatar}
            </div>
            <div className="message-bubble bubble-assistant">
              <div className="typing-indicator"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 情绪感知状态条：只如实显示"此刻的你"，是否告诉 TA 由用户自己决定 */}
      {faceMood && (
        <div style={{
          display: 'flex', justifyContent: 'center',
          padding: '4px 12px 0',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, padding: '4px 12px', borderRadius: 999,
            background: MOOD_META[faceMood]?.negative ? 'rgba(244,114,182,0.12)' : 'rgba(125,211,252,0.10)',
            color: MOOD_META[faceMood]?.negative ? '#f9a8d4' : '#7dd3fc',
            border: `1px solid ${MOOD_META[faceMood]?.negative ? 'rgba(244,114,182,0.30)' : 'rgba(125,211,252,0.25)'}`,
          }}>
            <span>{MOOD_META[faceMood]?.emoji || '🔍'}</span>
            <span>此刻的你看起来{faceMood} · 点摄像头小窗按钮，可以把心情递给{character.name}</span>
          </div>
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`和${character.name}说点什么吧...`}
          rows={1}
          disabled={isLoading}
        />
        {/* 语音按钮 */}
        <button
          className={`chat-mic-btn ${isRecording ? 'chat-mic-recording' : ''}`}
          onClick={toggleVoice}
          title={isRecording ? '点击停止识别' : (iatReady ? '语音输入（讯飞听写）' : '语音输入（浏览器识别）')}
          disabled={isLoading}
        >
          {isRecording ? '⏹' : '🎤'}
        </button>
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