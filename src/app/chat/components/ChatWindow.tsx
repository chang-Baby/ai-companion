'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Message, Memory, DisplayCharacter } from '../../data/types';
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
  onNewChat,
  onSidebarToggle,
  onOpenSettings,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const startTextRef = useRef(''); // 录音前 input 的快照
  const spokenRef = useRef('');    // 本次录音已确认的文本

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

  // 语音识别
  const toggleVoice = useCallback(async () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert('你的浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch {
      alert('需要麦克风权限才能使用语音输入，请在浏览器设置中允许麦克风访问');
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
  }, [isRecording, input]);

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

  return (
    <div className="chat-main">
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
          <button className="chat-new-btn" onClick={onOpenSettings} title="角色设定">⚙️ 设定</button>
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
          messages.map((msg, i) => <MessageBubble key={i} message={msg} character={character} />)
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
          title={isRecording ? '点击停止' : '语音输入'}
          disabled={isLoading}
        >
          🎤
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