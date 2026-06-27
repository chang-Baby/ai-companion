// 预设角色标识符
export type PresetCharacterId = 'xingchen' | 'moli' | 'yunxi' | 'weiyang';

// 角色 ID：预设或自定义（custom_ 前缀）
export type CharacterId = PresetCharacterId | string;

// 单条聊天消息
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// 每日打卡记录
export interface DailyCheckIn {
  date: string;
  duration: number;
  messageCount: number;
  topics: string[];
  mood: string;
}

// 长期记忆
export interface Memory {
  conversationSummary: string;
  keyFacts: string[];
  dailyCheckIns: DailyCheckIn[];
  totalChatTime: number;
  recentMood: string;
  userGoals: string[];
  weakSubjects?: string[];
  studyHours?: number;
  examDate?: string;
  lastUpdated: string;
}

// 基础角色配置
export interface CharacterConfig {
  id: CharacterId;
  name: string;
  emoji: string;
  title: string;
  description: string;
  personality: string;
  styleDesc: string;
  systemPrompt: string;
  features: string[];
  isPreset: boolean; // true = 预设角色，false = 自定义角色
}

// 自定义角色存储
export interface CustomCharacter {
  id: string;          // "custom_1700000000000"
  name: string;
  emoji: string;
  title: string;
  description: string;
  personality: string;
  styleDesc: string;   // 自由书写的风格描述
  systemPrompt: string;
  features: string[];
  avatar?: string;     // URL 或 base64
  createdAt: string;
}

// API 类型
export interface ChatRequest {
  messages: Message[];
  settings: {
    characterId: CharacterId;
    name: string;
    personality: string;
    styleDesc: string;
    memory: Memory;
  };
}

export interface ChatResponse {
  content: string;
}

export interface MemoryRequest {
  conversation: Message[];
  existingMemory: Memory;
  characterId: CharacterId;
}

export interface MemoryResponse {
  memory: Memory;
}

// 显示用角色（预设或自定义的统一视图）
export interface DisplayCharacter {
  id: CharacterId;
  name: string;
  emoji: string;
  title: string;
  description: string;
  personality: string;
  styleDesc: string;
  systemPrompt: string;
  features: string[];
  isPreset: boolean;
  displayAvatar: string;  // emoji, URL, 或 base64
}

// 设定弹窗数据
export interface ChatSettings {
  avatar: string;
}