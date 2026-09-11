// ============================================================
// 讯飞语音听写（IAT）后端代理
// 前端录 16kHz 单声道 PCM → base64 上传；服务端按讯飞帧协议转发 → 返回识别文本
// 失败时前端自动降级浏览器 Web Speech API
// ============================================================
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IAT_HOST = 'iat-api.xfyun.cn';
const IAT_PATH = '/v2/iat';
const FRAME_SIZE = 1280; // 讯飞要求每帧 1280 字节 PCM

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  const appId = process.env.XUNFEI_APPID;
  const apiKey = process.env.XUNFEI_API_KEY;
  const apiSecret = process.env.XUNFEI_API_SECRET;
  if (!appId || !apiKey || !apiSecret) {
    return Response.json({ error: 'iat_unavailable' }, { status: 503 });
  }

  let audioB64 = '';
  try {
    const body = await request.json();
    audioB64 = String(body?.audio || '').replace(/\s/g, '');
  } catch {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }
  if (!audioB64 || audioB64.length < 100) {
    return Response.json({ error: 'audio_too_short' }, { status: 400 });
  }

  const pcm = Buffer.from(audioB64, 'base64');

  try {
    const url = buildAuthUrl(IAT_HOST, IAT_PATH, apiKey, apiSecret);
    const ws = new WebSocket(url);

    const result = await new Promise<{ text: string }>((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => {
        try { ws.close(); } catch {}
        reject(new Error('iat_timeout'));
      }, 20000);

      ws.onopen = async () => {
        const common = { app_id: appId };
        const business = {
          language: 'zh_cn',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 3000,
          dwa: 'wpgs', // 动态修正，减少重复字
        };

        let sent = 0;
        let first = true;
        while (sent < pcm.length) {
          const chunk = pcm.subarray(sent, sent + FRAME_SIZE);
          const status = sent + FRAME_SIZE >= pcm.length ? 2 : 1;
          const frame: any = {
            data: {
              status,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: chunk.toString('base64'),
            },
          };
          if (first) {
            frame.common = common;
            frame.business = business;
            first = false;
          }
          ws.send(JSON.stringify(frame));
          sent += FRAME_SIZE;
          await sleep(40); // 讯飞要求帧间隔约 40ms
        }
      };

      ws.onmessage = (ev: MessageEvent) => {
        let data: any;
        try { data = JSON.parse(String(ev.data)); } catch { return; }
        if (data.code !== 0) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          reject(new Error(`iat_code_${data.code}`));
          return;
        }
        const wsArr = data.data?.result?.ws;
        if (Array.isArray(wsArr)) {
          // 动态修正模式：pgs=rpl 表示前一片段被替换，apd/无 pgs 表示追加
          const pgs = data.data.result.pgs;
          const seg = wsArr
            .map((w: any) => w.cw?.map((c: any) => c.w).join('') || '')
            .join('');
          if (pgs === 'rpl') {
            text = text.replace(/[^\s]+$/, '') + seg;
          } else {
            text += seg;
          }
        }
        if (data.data?.status === 2) {
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve({ text: text.trim() });
        }
      };

      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('iat_ws_error'));
      };
    });

    return Response.json({ text: result.text });
  } catch {
    return Response.json({ error: 'iat_failed' }, { status: 502 });
  }
}
