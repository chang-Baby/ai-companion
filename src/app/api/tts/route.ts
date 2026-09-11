// ============================================================
// 讯飞语音合成（TTS）后端代理
// 密钥只存在服务端环境变量，浏览器永远拿不到；讯飞不可用时前端自动降级浏览器 speechSynthesis
// ============================================================
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTS_HOST = 'tts-api.xfyun.cn';
const TTS_PATH = '/v2/tts';

// 超拟人合成（x4/x5/x6 音色）专用端点——新版 super smart-tts（mcd9m97e6），支持 x6 系列
const HYPER_HOST = 'cbm01.cn-huabei-1.xf-yun.com';
const HYPER_PATH = '/v1/private/mcd9m97e6';

function isHyperVcn(vcn: string): boolean {
  return /^x[456]_/.test(vcn);
}

// 讯飞 WebAPI 鉴权：HMAC-SHA256 签名 host+date+request-line，拼进 wss URL
function buildAuthUrl(host: string, path: string, apiKey: string, apiSecret: string): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin, 'utf8')
    .digest('base64');
  const authorizationOrigin =
    `api_key="${apiKey}", algorithm="hmac-sha256", ` +
    `headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin, 'utf8').toString('base64');
  return (
    `wss://${host}${path}?authorization=${encodeURIComponent(authorization)}` +
    `&date=${encodeURIComponent(date)}&host=${host}`
  );
}

// 只合成"说出口"的话：去掉（动作）、*强调*、引号、转账卡片等非台词内容
function cleanSpeechText(raw: string): string {
  return String(raw)
    .replace(/TRANSFER_CARD:[\s\S]*/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

async function synthOnce(url: string, appId: string, text: string, vcn: string): Promise<Buffer> {
  const ws = new WebSocket(url);
  const chunks: Buffer[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('tts_timeout'));
    }, 15000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          common: { app_id: appId },
          business: {
            aue: 'lame', // 返回 mp3
            sfl: 1,      // 流式分片
            vcn,         // 发音人
            tte: 'UTF8',
            speed: 50,
            volume: 50,
            pitch: 50,
          },
          data: {
            status: 2, // 一次性发完全部文本
            text: Buffer.from(text, 'utf8').toString('base64'),
          },
        })
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      let data: any;
      try { data = JSON.parse(String(ev.data)); } catch { return; }
      if (data.code !== 0) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        reject(new Error(`tts_code_${data.code}`));
        return;
      }
      if (data.data?.audio) chunks.push(Buffer.from(data.data.audio, 'base64'));
      if (data.data?.status === 2) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(Buffer.concat(chunks));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('tts_ws_error'));
    };
  });
}

// 超拟人合成（x4/x5/x6 音色）：走 cbm01 专用端点，协议与标准 TTS 不同
async function synthHyperOnce(url: string, appId: string, text: string, vcn: string): Promise<Buffer> {
  const ws = new WebSocket(url);
  // 官方提示：多帧返回顺序可能乱序，按 seq 缓存后拼接
  const frameMap = new Map<number, Buffer>();

  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('hyper_tts_timeout'));
    }, 15000);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          header: { app_id: appId, status: 2 },
          parameter: {
            // 注意：oral 口语化配置仅 x4 系列支持，x5/x6 不传
            ...(/^x4_/.test(vcn) ? { oral: { spark_assist: 1, oral_level: 'mid' } } : {}),
            tts: {
              vcn,
              speed: 50,
              volume: 50,
              pitch: 50,
              bgs: 0,
              reg: 0,
              rdn: 0,
              rhy: 0,
              audio: { encoding: 'lame', sample_rate: 24000, channels: 1, bit_depth: 16, frame_size: 0 },
            },
          },
          payload: {
            text: {
              encoding: 'utf8',
              compress: 'raw',
              format: 'plain',
              status: 2,
              seq: 0,
              text: Buffer.from(text, 'utf8').toString('base64'),
            },
          },
        })
      );
    };

    ws.onmessage = (ev: MessageEvent) => {
      let data: any;
      try { data = JSON.parse(String(ev.data)); } catch { return; }
      const code = data?.header?.code;
      if (code !== 0) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        // 带上讯飞返回的 message，方便区分：10010=没授权 / 11200=服务未开通
        reject(new Error(`hyper_tts_code_${code ?? 'unknown'}:${data?.header?.message || ''}`));
        return;
      }
      const audioField = data?.payload?.audio;
      if (audioField?.audio) {
        frameMap.set(typeof audioField.seq === 'number' ? audioField.seq : frameMap.size, Buffer.from(audioField.audio, 'base64'));
      }
      // 结束标记在 payload.audio.status=2（官方响应协议）；header.status 兜底判断
      if (audioField?.status === 2 || data?.header?.status === 2) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        const ordered = [...frameMap.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
        resolve(Buffer.concat(ordered));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('hyper_tts_ws_error'));
    };
  });
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  const text: string = cleanSpeechText(body?.text || '');
  // 发音人候选链：优先用前端传入的 vcns 数组（角色专属音色），兼容旧版单个 vcn
  const voiceList: string[] = Array.isArray(body?.vcns)
    ? body.vcns.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
    : (typeof body?.vcn === 'string' && body.vcn ? [body.vcn] : ['aisjiuxu']);
  // 链尾兜底：x6_tiexinnanyou_mini 已验证授权可用（自然青年男声），xiaoyan 是标准端点机械音保底
  for (const fb of ['x6_tiexinnanyou_mini', 'xiaoyan']) {
    if (!voiceList.includes(fb)) voiceList.push(fb);
  }
  if (!text) return Response.json({ error: 'empty_text' }, { status: 200 });

  const appId = process.env.XUNFEI_APPID;
  const apiKey = process.env.XUNFEI_API_KEY;
  const apiSecret = process.env.XUNFEI_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    return Response.json({ error: 'tts_unavailable' }, { status: 503 });
  }

  try {
    let audio: Buffer | null = null;
    let usedVoice = '';
    let lastErr = '';
    // 按候选链依次尝试：超拟人音色未授权（11200 等）或超时，自动降级到下一个
    for (const vcn of voiceList) {
      try {
        // x4/x5/x6 超拟人音色走 cbm01 专用端点，普通音库走标准端点
        const hyper = isHyperVcn(vcn);
        const url = buildAuthUrl(
          hyper ? HYPER_HOST : TTS_HOST,
          hyper ? HYPER_PATH : TTS_PATH,
          apiKey,
          apiSecret,
        );
        const out = hyper
          ? await synthHyperOnce(url, appId, text, vcn)
          : await synthOnce(url, appId, text, vcn);
        if (out.length > 0) { audio = out; usedVoice = vcn; break; }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : 'tts_unknown';
        console.warn(`[tts] vcn ${vcn} 失败:`, lastErr);
        continue;
      }
    }

    if (!audio || !audio.length) {
      console.error('[tts] all voices failed:', voiceList.join(','), lastErr);
      return Response.json({ error: 'tts_failed' }, { status: 502 });
    }

    return new Response(new Uint8Array(audio), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-TTS-Voice': usedVoice, // 诊断：实际命中的发音人（兜底降级时可见）
        'X-TTS-Fallback': (lastErr || 'none').replace(/[^\x20-\x7e]/g, ' '), // 诊断：最后一条失败原因（10010=没授权 11200=服务未开通）
      },
    });
  } catch {
    return Response.json({ error: 'tts_failed' }, { status: 502 });
  }
}
