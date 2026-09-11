// 预设角色标识符
export type PresetCharacterId = 'ji_linyuan' | 'lu_yanzhou' | 'yu_wen' | 'xie_huai';

// 角色 ID：预设或自定义（custom_ 前缀）
export type CharacterId = PresetCharacterId | string;

// 单条聊天消息
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  proactive?: boolean; // true = AI 主动关怀消息（非用户提问触发）
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
  voice?: string[];  // TTS 发音人候选链：按顺序尝试，前一个未授权/失败自动降级到下一个
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
    description?: string;
    style?: string;
    memory: Memory;
    faceMood?: string | null;   // 摄像头识别到的当前表情（中文标签）
    proactive?: boolean;        // true = 主动关怀模式（AI 先开口）
    proactiveReason?: string;   // 主动开口的由头：mood:难过 / idle / returning:36 / late_night / tab_back
  };
}

// 外观主题
export interface ChatTheme {
  bg: string;      // 背景预设 key
  bubble: string;  // 气泡风格 key
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
  voice?: string[];       // TTS 发音人候选链
}

// 设定弹窗数据
export interface ChatSettings {
  avatar: string;
}