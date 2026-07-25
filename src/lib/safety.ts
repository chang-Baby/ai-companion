/* ============================================================
   安全模块
   ============================================================
   两级权限：
     basic  — 网站密码登录，每角色 20 次对话，自定义角色限 1 个
     vip    — 邀请码升级，无限制

   数据持久化：.data/ 目录
   ============================================================ */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// ===================== 配置 ===================== //
const SECRET = process.env.ACCESS_CODE_SECRET || 'ai-companion-salt-2026';
const QUOTA_PER_CHAR = 20;           // basic 用户每角色免费次数
const RATE_LIMIT = 20;               // 每分钟最多请求数
const RATE_WINDOW_MS = 60_000;
const DAILY_COST_LIMIT = 5;          // 每日成本熔断（元）
const COST_PER_1K_TOKENS = 0.002;

const DATA_DIR = path.join(process.cwd(), '.data');
const QUOTA_FILE = path.join(DATA_DIR, 'quotas.json');       // sessionId → { xingchen: 5, weiyang: 12, ... }
const INVITED_FILE = path.join(DATA_DIR, 'invited.json');    // sessionId → true（已用邀请码升级）

// ===================== 文件 I/O ===================== //

function ensureDir() { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); }
function readJSON<T>(fp: string, fb: T): T { try { ensureDir(); if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {} return fb; }
function writeJSON(fp: string, d: unknown) { try { ensureDir(); fs.writeFileSync(fp, JSON.stringify(d), 'utf-8'); } catch {} }

// ===================== 缓存 ===================== //
let quotaCache: Record<string, Record<string, number>> | null = null;
let invitedCache: Record<string, boolean> | null = null;

function getQuota(): Record<string, Record<string, number>> { if (!quotaCache) quotaCache = readJSON(QUOTA_FILE, {}); return quotaCache; }
function saveQuota() { if (quotaCache) writeJSON(QUOTA_FILE, quotaCache); }
function getInvited(): Record<string, boolean> { if (!invitedCache) invitedCache = readJSON(INVITED_FILE, {}); return invitedCache; }
function saveInvited() { if (invitedCache) writeJSON(INVITED_FILE, invitedCache); }

/* ============================================================
   密码验证
   ============================================================ */
export function validatePassword(pw: string): string | null {
  const expected = process.env.SITE_PASSWORD || '';
  if (!expected) return null; // 没配密码 = 拒绝
  if (pw === expected) return crypto.randomUUID().slice(0, 8);
  return null;
}

/* ============================================================
   邀请码验证 + 升级
   ============================================================ */
export function validateInviteCode(code: string): string | null {
  const raw = process.env.ACCESS_CODES || '';
  const codes = raw.split(',').map(c => c.trim()).filter(Boolean);
  if (codes.length === 0) return null;
  return codes.includes(code) ? code : null;
}

export function upgradeToVip(sessionId: string): void {
  const invited = getInvited();
  invited[sessionId] = true;
  saveInvited();
  // 清掉配额记录（vip 不需要）
  const quotas = getQuota();
  delete quotas[sessionId];
  saveQuota();
}

export function isVip(sessionId: string): boolean {
  return getInvited()[sessionId] === true;
}

/* ============================================================
   Token 签名
   ============================================================ */
export function generateToken(sessionId: string): string {
  const ts = Date.now().toString(36);
  const sig = crypto.createHmac('sha256', SECRET).update(`${sessionId}.${ts}`).digest('hex').slice(0, 16);
  return `${Buffer.from(sessionId).toString('base64url')}.${ts}.${sig}`;
}

export function parseToken(token: string): { sessionId: string; valid: boolean } {
  try {
    const [b64, ts, sig] = token.split('.');
    if (!b64 || !ts || !sig) return { sessionId: '', valid: false };
    const sessionId = Buffer.from(b64, 'base64url').toString('utf-8');
    const expected = crypto.createHmac('sha256', SECRET).update(`${sessionId}.${ts}`).digest('hex').slice(0, 16);
    return sig === expected ? { sessionId, valid: true } : { sessionId: '', valid: false };
  } catch { return { sessionId: '', valid: false }; }
}

/* ============================================================
   按角色配额（仅 basic 用户，vip 不检查）
   ============================================================ */
export function getCharQuota(sessionId: string, charId: string): number {
  const q = getQuota();
  return q[sessionId]?.[charId] ?? QUOTA_PER_CHAR;
}

export function consumeCharQuota(sessionId: string, charId: string): { allowed: boolean; remaining: number } {
  const q = getQuota();
  if (!q[sessionId]) q[sessionId] = {};
  const current = q[sessionId][charId] ?? QUOTA_PER_CHAR;
  if (current <= 0) return { allowed: false, remaining: 0 };
  q[sessionId][charId] = current - 1;
  saveQuota();
  return { allowed: true, remaining: current - 1 };
}

/* ============================================================
   频率限制（按 sessionId）
   ============================================================ */
const rateLimitMap = new Map<string, number[]>();
let cleanCounter = 0;

export function checkRateLimit(sessionId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const tss = rateLimitMap.get(sessionId) || [];
  const recent = tss.filter(t => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) return { allowed: false, retryAfter: Math.ceil((recent[0] + RATE_WINDOW_MS - now) / 1000) };
  recent.push(now); rateLimitMap.set(sessionId, recent);
  return { allowed: true };
}

function maybeCleanRateLimit() {
  if (++cleanCounter <= 100) return; cleanCounter = 0; const now = Date.now();
  for (const [k, ts] of rateLimitMap) { const r = ts.filter(t => now - t < RATE_WINDOW_MS); if (r.length) rateLimitMap.set(k, r); else rateLimitMap.delete(k); }
}

/* ============================================================
   成本熔断
   ============================================================ */
let dailyCost = 0; let costDate = new Date().toDateString();

export function getDailyStats() { return { dailyCost: Math.round(dailyCost * 100) / 100, limit: DAILY_COST_LIMIT }; }

export function checkCircuitBreaker(textLen: number): { allowed: boolean; reason?: string } {
  const today = new Date().toDateString();
  if (today !== costDate) { dailyCost = 0; costDate = today; }
  const est = Math.ceil(textLen / 2) * COST_PER_1K_TOKENS / 1000;
  if (dailyCost + est > DAILY_COST_LIMIT) return { allowed: false, reason: `系统维护中（今日消耗已达 ${DAILY_COST_LIMIT} 元），请明日再试` };
  dailyCost += est; return { allowed: true };
}

/* ============================================================
   综合检查
   ============================================================ */
export function fullSafetyCheck(sessionId: string, charId: string, textLen: number): {
  pass: boolean; error?: string; status?: number; remaining?: number; retryAfter?: number; needUpgrade?: boolean;
} {
  const vip = isVip(sessionId);
  maybeCleanRateLimit();

  // 频率
  const rate = checkRateLimit(sessionId);
  if (!rate.allowed) return { pass: false, error: `太快了，${rate.retryAfter} 秒后再发`, status: 429, retryAfter: rate.retryAfter };

  // 配额（vip 跳过）
  if (!vip) {
    const q = consumeCharQuota(sessionId, charId);
    if (!q.allowed) return { pass: false, error: '该角色免费对话已用完，请输入邀请码继续', status: 403, remaining: 0, needUpgrade: true };
    // 熔断
    const cb = checkCircuitBreaker(textLen);
    if (!cb.allowed) return { pass: false, error: cb.reason, status: 503 };
    return { pass: true, remaining: q.remaining };
  }

  // vip 只检查熔断
  const cb = checkCircuitBreaker(textLen);
  if (!cb.allowed) return { pass: false, error: cb.reason, status: 503 };
  return { pass: true, remaining: -1 }; // -1 = 无限
}