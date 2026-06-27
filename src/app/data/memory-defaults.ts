import { Memory } from './types';

export function createDefaultMemory(): Memory {
  return {
    conversationSummary: '',
    keyFacts: [],
    dailyCheckIns: [],
    totalChatTime: 0,
    recentMood: 'neutral',
    userGoals: [],
    lastUpdated: new Date().toISOString(),
  };
}