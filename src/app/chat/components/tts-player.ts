// ============================================================
// tts-player —— 角色语音播放
// 优先走讯飞语音合成（/api/tts，音色更自然）；失败自动降级浏览器内置语音
// ============================================================

let currentAudio: HTMLAudioElement | null = null;

/** 停止当前正在播放的语音 */
export function stopSpeak() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

/** 只朗读"说出口"的台词：去掉（动作）、*强调* 等（后端也会清洗一遍） */
function cleanText(raw: string): string {
  return String(raw)
    .replace(/TRANSFER_CARD:[\s\S]*/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function browserFallback(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 1;
  u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const zh = voices.find((v) => /zh[-_]CN/i.test(v.lang));
  if (zh) u.voice = zh;
  window.speechSynthesis.speak(u);
}

/**
 * 播放语音
 * @param text  台词原文（含动作描写也没关系，会自动清洗）
 * @param voice 讯飞发音人候选链（按顺序尝试，后端自动降级未授权音色）
 */
export async function speak(text: string, voice?: string[]): Promise<void> {
  stopSpeak();
  const clean = cleanText(text);
  if (!clean) return;

  const vcns = voice && voice.length ? voice : ['aisjiuxu'];
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean.slice(0, 600), vcns }),
    });
    if (!res.ok) throw new Error('tts_bad_status');
    const blob = await res.blob();
    if (!blob.size) throw new Error('tts_empty_blob');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
    };
    audio.onerror = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    // 讯飞不可用（网络/额度/配置缺失）→ 浏览器内置语音兜底，永久免费
    browserFallback(clean);
  }
}
