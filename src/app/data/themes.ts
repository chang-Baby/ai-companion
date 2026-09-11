// 聊天外观主题预设（深色静谧风，桌面网页自适应）
// 通过 CSS 变量作用于 .chat-main：--chat-bg / --chat-panel-bg / --chat-border
// --bubble-user-bg / --bubble-user-text / --bubble-ai-bg / --bubble-ai-text / --chat-accent

export interface BgPreset {
  key: string;
  name: string;
  emoji: string;
  chatBg: string;
  panelBg: string;   // 头部/输入栏毛玻璃底色
  border: string;
}

export interface BubblePreset {
  key: string;
  name: string;
  emoji: string;
  userBg: string;
  userText: string;
  aiBg: string;
  aiText: string;
  accent: string;    // 发送按钮等强调色
}

export const BG_PRESETS: BgPreset[] = [
  {
    key: 'night',
    name: '深夜',
    emoji: '🌌',
    chatBg:
      'radial-gradient(1200px 600px at 75% -10%, rgba(99,102,160,0.14), transparent 60%), linear-gradient(180deg,#0a0a14 0%,#050508 100%)',
    panelBg: 'rgba(10,10,16,0.92)',
    border: 'rgba(255,255,255,0.06)',
  },
  {
    key: 'ocean',
    name: '深海',
    emoji: '🌊',
    chatBg:
      'radial-gradient(1000px 520px at 80% -5%, rgba(56,189,248,0.13), transparent 60%), linear-gradient(180deg,#07101e 0%,#04070f 100%)',
    panelBg: 'rgba(6,13,24,0.92)',
    border: 'rgba(125,211,252,0.12)',
  },
  {
    key: 'dusk',
    name: '暮色',
    emoji: '🌆',
    chatBg:
      'radial-gradient(1000px 520px at 20% -5%, rgba(244,114,182,0.12), transparent 60%), linear-gradient(180deg,#120a17 0%,#08050c 100%)',
    panelBg: 'rgba(17,10,21,0.92)',
    border: 'rgba(244,114,182,0.12)',
  },
  {
    key: 'aurora',
    name: '极光',
    emoji: '✨',
    chatBg:
      'radial-gradient(820px 420px at 15% 8%, rgba(52,211,153,0.12), transparent 60%), radial-gradient(820px 420px at 85% 92%, rgba(167,139,250,0.12), transparent 60%), linear-gradient(180deg,#080d12 0%,#05070b 100%)',
    panelBg: 'rgba(8,12,18,0.92)',
    border: 'rgba(167,139,250,0.12)',
  },
];

export const BUBBLE_PRESETS: BubblePreset[] = [
  {
    key: 'ink',
    name: '暮灰',
    emoji: '🖤',
    userBg: 'linear-gradient(145deg,#3a3a4e,#2c2c3e)',
    userText: 'rgba(255,255,255,0.95)',
    aiBg: 'rgba(255,255,255,0.06)',
    aiText: 'rgba(255,255,255,0.88)',
    accent: 'linear-gradient(145deg,#4f4f73,#38384f)',
  },
  {
    key: 'sky',
    name: '冰蓝',
    emoji: '🧊',
    userBg: 'linear-gradient(145deg,#1d4e74,#133450)',
    userText: '#e0f2fe',
    aiBg: 'rgba(125,211,252,0.09)',
    aiText: 'rgba(226,243,255,0.92)',
    accent: 'linear-gradient(145deg,#38bdf8,#0284c7)',
  },
  {
    key: 'rose',
    name: '暖粉',
    emoji: '🌸',
    userBg: 'linear-gradient(145deg,#5c3046,#432234)',
    userText: '#fce7f3',
    aiBg: 'rgba(244,114,182,0.09)',
    aiText: 'rgba(252,231,243,0.92)',
    accent: 'linear-gradient(145deg,#f472b6,#db2777)',
  },
];
