'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

/* ============================================================
   EmotionCamera —— 摄像头表情识别（多模态情感感知）
   - face-api.js 引擎与模型权重均放在 public/ 下本地加载
   - 表情识别全程在用户浏览器本地完成，视频画面不上传任何服务器
   - 识别结果通过 onMood 回调给父组件（仅情绪变化时回调）
   - 按钮/小窗均可拖动（鼠标 + 触屏），位置自动记忆
   ============================================================ */

export type FaceMood =
  | 'neutral' | 'happy' | 'sad' | 'angry'
  | 'fearful' | 'disgusted' | 'surprised';

const MOOD_LABEL: Record<FaceMood, string> = {
  neutral: '平静',
  happy: '开心',
  sad: '难过',
  angry: '生气',
  fearful: '紧张害怕',
  disgusted: '反感',
  surprised: '惊讶',
};

const MOOD_EMOJI: Record<FaceMood, string> = {
  neutral: '😌',
  happy: '😊',
  sad: '🥺',
  angry: '😠',
  fearful: '😨',
  disgusted: '😒',
  surprised: '😲',
};

// 需要主动关怀介入的负面情绪（中文标签）
export const NEGATIVE_MOODS = new Set(['难过', '生气', '紧张害怕', '反感']);

const FACEAPI_URI = '/vendor/face-api.min.js';
const MODELS_URI = '/models';
const DETECT_INTERVAL_MS = 1200;
const NO_FACE_LIMIT = 3;      // 连续 3 次没检测到脸 → 视为无人
export const MOOD_FRESH_MS = 15000; // 表情结果 15 秒内有效
const POS_KEY = 'companion_cam_pos';
const DRAG_THRESHOLD = 6;     // 位移超过 6px 判定为拖动，否则算点击

type Status = 'off' | 'loading' | 'on' | 'error';

interface EmotionCameraProps {
  /** 情绪变化时回调中文标签（如"开心"）；无人脸/关闭时回调 null */
  onMood: (label: string | null) => void;
  /** 用户点击"把此刻心情告诉 TA"时回调；返回 false 表示对方忙碌、未发出 */
  onShareMood?: (label: string) => boolean;
}

function loadSavedPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch {}
  return null;
}

export default function EmotionCamera({ onMood, onShareMood }: EmotionCameraProps) {
  const [status, setStatus] = useState<Status>('off');
  const [mood, setMood] = useState<FaceMood | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [sentFlash, setSentFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noFaceCountRef = useRef(0);
  const faceapiRef = useRef<any>(null);
  const onMoodRef = useRef(onMood);
  onMoodRef.current = onMood;
  const onShareMoodRef = useRef(onShareMood);
  onShareMoodRef.current = onShareMood;
  const lastMoodLabelRef = useRef<string | null>(null);

  // 用户主动把"此刻心情"递给 TA：心情由用户安放，而不是系统偷看
  const handleShareMood = useCallback(() => {
    const label = lastMoodLabelRef.current;
    if (!label || label === '平静') return;
    const ok = onShareMoodRef.current?.(label);
    if (ok === false) return;  // 对方正在回复等，稍后再试
    setSentFlash(true);
    setTimeout(() => setSentFlash(false), 2000);
  }, []);

  // 每帧检测结果都向上回调（父组件靠连续帧做情绪稳定判定；React 相同 state 自动跳过渲染）
  const reportMood = useCallback((label: string | null) => {
    lastMoodLabelRef.current = label;
    onMoodRef.current(label);
  }, []);

  useEffect(() => { setPos(loadSavedPos()); }, []);

  /* ---------- 拖拽（pointer 事件，鼠标/触屏通用）---------- */
  const dragRef = useRef<{
    sx: number; sy: number; px: number; py: number;
    moved: boolean; w: number; h: number;
  } | null>(null);
  const didDragRef = useRef(false);

  const onDragMove = useRef((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      d.moved = true;
      didDragRef.current = true;
    }
    if (!d.moved) return;
    const nx = Math.min(Math.max(4, d.px + dx), window.innerWidth - d.w - 4);
    const ny = Math.min(Math.max(4, d.py + dy), window.innerHeight - d.h - 4);
    setPos({ x: nx, y: ny });
  }).current;

  const onDragEnd = useRef(() => {
    const d = dragRef.current;
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    if (d?.moved) {
      setPos((p) => {
        if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} }
        return p;
      });
    }
    // 点击动作延迟一帧再放行，确保拖动后不触发 click
    setTimeout(() => { didDragRef.current = false; }, 0);
  }).current;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      sx: e.clientX, sy: e.clientY,
      px: rect.left, py: rect.top,
      moved: false, w: rect.width, h: rect.height,
    };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  }, [onDragMove, onDragEnd]);

  // 若本次是拖动，吞掉 click（开摄像头/关摄像头都不会误触）
  const guardClick = useCallback((fn: () => void) => {
    return () => { if (!didDragRef.current) fn(); };
  }, []);

  const dragStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {};

  /* ---------- face-api 加载 ---------- */
  const loadFaceApi = useCallback(async (): Promise<any> => {
    if (faceapiRef.current) return faceapiRef.current;
    if ((window as any).faceapi) {
      faceapiRef.current = (window as any).faceapi;
      return faceapiRef.current;
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = FACEAPI_URI;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('识别引擎加载失败，请刷新页面重试'));
      document.head.appendChild(s);
    });
    faceapiRef.current = (window as any).faceapi;
    return faceapiRef.current;
  }, []);

  const stopAll = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    noFaceCountRef.current = 0;
    setMood(null);
    reportMood(null);
  }, [reportMood]);

  const start = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      const faceapi = await loadFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URI),
        faceapi.nets.faceExpressionNet.loadFromUri(MODELS_URI),
      ]);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus('on');

      timerRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
            .withFaceExpressions();
          if (!detection) {
            noFaceCountRef.current += 1;
            if (noFaceCountRef.current >= NO_FACE_LIMIT) {
              setMood(null);
              reportMood(null);
            }
            return;
          }
          noFaceCountRef.current = 0;
          const sorted = detection.expressions.asSortedArray();
          const top = sorted[0];
          if (top && top.expression) {
            const m = top.expression as FaceMood;
            setMood(m);
            reportMood(MOOD_LABEL[m]);
          }
        } catch {
          // 单帧识别失败忽略，等下一帧
        }
      }, DETECT_INTERVAL_MS);
    } catch (e: any) {
      stopAll();
      const msg = e?.name === 'NotAllowedError'
        ? '摄像头权限被拒绝，可在浏览器地址栏重新授权'
        : e?.message || '摄像头开启失败';
      setErrorMsg(msg);
      setStatus('error');
    }
  }, [loadFaceApi, stopAll, reportMood]);

  // 卸载时彻底释放
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', onDragEnd);
      window.removeEventListener('pointercancel', onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

  const handleClose = useCallback(() => {
    stopAll();
    setStatus('off');
  }, [stopAll]);

  /* ---------- UI ---------- */
  const baseStyle: React.CSSProperties = {
    position: 'fixed', right: 20, bottom: 24, zIndex: 50,
    cursor: 'grab', touchAction: 'none', userSelect: 'none',
    WebkitUserSelect: 'none',
    ...dragStyle,
  };

  if (status === 'off') {
    return (
      <button
        onPointerDown={handlePointerDown}
        onClick={guardClick(start)}
        title="开启后 AI 能看见你的表情（仅本机识别，不上传画面），按钮可拖动"
        style={{
          ...baseStyle,
          borderRadius: 999, padding: '10px 16px', border: 'none',
          background: 'rgba(99,102,241,0.92)', color: '#fff', fontSize: 14,
          boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        📷 <span>开启表情感知</span>
      </button>
    );
  }

  return (
    <div
      onPointerDown={handlePointerDown}
      style={{
        ...baseStyle,
        width: 190, borderRadius: 16, overflow: 'hidden',
        background: 'rgba(30,32,48,0.95)', color: '#fff',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: '#000' }}>
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', pointerEvents: 'none' }}
        />
        {status === 'loading' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center', padding: 8,
          }}>
            正在加载表情识别模型…<br />（首次约需几秒）
          </div>
        )}
        {status === 'on' && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: 'rgba(0,0,0,0.55)', borderRadius: 999,
            padding: '3px 10px', fontSize: 13, pointerEvents: 'none',
          }}>
            {mood ? `${MOOD_EMOJI[mood]} ${MOOD_LABEL[mood]}` : '🔍 未检测到人脸'}
          </div>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleClose}
          title="关闭摄像头"
          style={{
            position: 'absolute', top: 6, right: 6, width: 22, height: 22,
            borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 13, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
      {status === 'on' && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleShareMood}
          disabled={!mood || mood === 'neutral' || sentFlash}
          title="把此刻的心情告诉 TA，TA 会结合你们正在聊的内容回应你"
          style={{
            width: 'calc(100% - 16px)', margin: '6px 8px 0',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            padding: '7px 8px', fontSize: 12, fontWeight: 600,
            background: sentFlash
              ? 'rgba(52,211,153,0.85)'
              : mood && mood !== 'neutral'
                ? 'linear-gradient(135deg, rgba(244,114,182,0.95), rgba(168,85,247,0.9))'
                : 'rgba(255,255,255,0.12)',
            color: '#fff',
            opacity: mood && mood !== 'neutral' ? 1 : 0.55,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          {sentFlash ? '✓ TA 已经收到啦' : mood && mood !== 'neutral'
            ? `把「${MOOD_EMOJI[mood]} ${MOOD_LABEL[mood]}」告诉 TA`
            : '先做个表情，再把心情递给 TA'}
        </button>
      )}
      <div style={{ padding: '6px 10px', fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.4, pointerEvents: 'none' }}>
        {status === 'error'
          ? <span style={{ color: '#fca5a5' }}>⚠️ {errorMsg}</span>
          : <>🔒 表情仅本机识别，画面不会上传；心情由你决定何时递给 TA</>}
      </div>
      {status === 'error' && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={start}
          style={{
            width: '100%', border: 'none', cursor: 'pointer', padding: '6px',
            background: 'rgba(99,102,241,0.9)', color: '#fff', fontSize: 12,
          }}
        >
          重试
        </button>
      )}
    </div>
  );
}

export { MOOD_LABEL };
