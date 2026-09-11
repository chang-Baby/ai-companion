// ============================================================
// PcmRecorder —— 浏览器原生录音，输出讯飞听写要求的 16kHz 单声道 PCM(base64)
// 零第三方依赖；4 秒静音自动停止；停止后一次性产出音频
// ============================================================

const TARGET_SAMPLE_RATE = 16000;

export class PcmRecorder {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private gain: GainNode | null = null;
  private buffers: Float32Array[] = [];
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private onSilence: (() => void) | null = null;
  private recording = false;

  async start(onSilence?: () => void): Promise<void> {
    this.onSilence = onSilence || null;
    this.buffers = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const AC: typeof AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AC();
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    // ScriptProcessor 全浏览器可用；输出端接一个 0 增益节点避免反馈噪音
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
    this.gain = this.audioCtx.createGain();
    this.gain.gain.value = 0;
    this.processor.onaudioprocess = (e) => {
      if (!this.recording) return;
      const data = e.inputBuffer.getChannelData(0);
      this.buffers.push(new Float32Array(data));
      // 简易静音检测：本帧 RMS（抽样计算即可）
      let sum = 0;
      for (let i = 0; i < data.length; i += 64) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / (data.length / 64));
      if (rms < 0.012) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.silenceTimer = null;
            this.onSilence?.();
          }, 4000);
        }
      } else if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
    };
    this.source.connect(this.processor);
    this.processor.connect(this.gain);
    this.gain.connect(this.audioCtx.destination);
    this.recording = true;
  }

  stop(): Promise<string> {
    return new Promise((resolve) => {
      this.recording = false;
      if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
      try { this.source?.disconnect(); } catch {}
      try { this.processor?.disconnect(); } catch {}
      try { this.gain?.disconnect(); } catch {}
      this.stream?.getTracks().forEach((t) => t.stop());

      const ctx = this.audioCtx;
      const buffers = this.buffers;
      const finish = (b64: string) => {
        ctx?.close().catch(() => {});
        resolve(b64);
      };

      if (!ctx || buffers.length === 0) { finish(''); return; }

      const inRate = ctx.sampleRate;
      const totalLen = buffers.reduce((n, b) => n + b.length, 0);
      const merged = new Float32Array(totalLen);
      let off = 0;
      for (const b of buffers) { merged.set(b, off); off += b.length; }

      // 线性降采样到 16kHz
      const ratio = inRate / TARGET_SAMPLE_RATE;
      const outLen = Math.floor(merged.length / ratio);
      const pcm16 = new Int16Array(outLen);
      let pos = 0;
      for (let i = 0; i < outLen; i++) {
        const idx = i * ratio;
        const i0 = Math.floor(idx);
        const frac = idx - i0;
        const s0 = merged[i0] || 0;
        const s1 = merged[i0 + 1] || s0;
        let s = s0 + (s1 - s0) * frac;
        s = Math.max(-1, Math.min(1, s));
        pcm16[pos++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // 去掉首尾静音帧
      let start = 0;
      let end = pcm16.length;
      const pad = Math.floor(TARGET_SAMPLE_RATE * 0.15);
      const threshold = 260;
      while (start < end && Math.abs(pcm16[start]) < threshold) start++;
      while (end > start && Math.abs(pcm16[end - 1]) < threshold) end--;
      start = Math.max(0, start - pad);
      end = Math.min(pcm16.length, end + pad);
      const clipped = pcm16.subarray(start, end);

      // Int16 → base64（分块 btoa，避免栈溢出）
      const bytes = new Uint8Array(clipped.buffer, clipped.byteOffset, clipped.byteLength);
      let binary = '';
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      finish(btoa(binary));
    });
  }
}
