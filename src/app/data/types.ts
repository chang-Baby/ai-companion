// 角色标识符
export type CharacterId = 'xingchen' | 'moli' | 'yunxi' | 'weiyang';

// 单条聊天消息
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
}

// 每日打卡记录
export interface DailyCheckIn {
  date: string;         // "2026-06-27"
  duration: number;     // 当日对话分钟数（估算）
  messageCount: number; // 当日消息条数
  topics: string[];     // ["数学复习", "心态调整"]
  mood: string;         // "motivated" | "tired" | "anxious" | "neutral" | "happy" | "frustrated"
}

// 长期记忆（每个角色独立存储）
export interface Memory {
  conversationSummary: string;    // 最近对话的 1-2 句话摘要
  keyFacts: string[];             // 用户关键信息 ["计算机专业大三", "目标院校清华"]
  dailyCheckIns: DailyCheckIn[];  // 滚动 90 天打卡记录
  totalChatTime: number;          // 累计对话分钟数（估算）
  recentMood: string;             // 最近一次情绪状态
  userGoals: string[];            // ["考研上岸", "每天学习6小时"]
  weakSubjects?: string[];        // 薄弱科目（未央专用）
  studyHours?: number;            // 已记录学习总时长（未央专用）
  examDate?: string;              // 考试日期（未央专用）
  lastUpdated: string;            // ISO 时间戳
}

// 角色配置
export interface CharacterConfig {
  id: CharacterId;
  name: string;
  emoji: string;
  title: string;
  description: string;
  personality: string;
  style: string;       // 回复风格代码（用于 fallback）
  styleDesc: string;   // 回复风格中文描述
  systemPrompt: string; // 系统 Prompt 模板，含 {name} {description} {memory} 占位符
  features: string[];
}

// API 请求/响应类型
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