/* ============================================================
   Auth API — 网站密码登入 / 邀请码升级
   POST { password } → basic token
   POST { upgrade, sessionId } → vip token
   ============================================================ */

import { validatePassword, generateToken, validateInviteCode, upgradeToVip } from '../../../lib/safety';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password, upgrade, sessionId } = body;

    // --- 普通登录：网站密码 ---
    if (password) {
      const sid = validatePassword(password);
      if (!sid) return Response.json({ error: '密码错误' }, { status: 401 });
      return Response.json({ token: generateToken(sid), sessionId: sid });
    }

    // --- 邀请码升级 ---
    if (upgrade && sessionId) {
      const valid = validateInviteCode(upgrade);
      if (!valid) return Response.json({ error: '邀请码无效' }, { status: 401 });
      upgradeToVip(sessionId);
      return Response.json({ token: generateToken(sessionId), sessionId, vip: true });
    }

    return Response.json({ error: '请提供密码或邀请码' }, { status: 400 });
  } catch {
    return Response.json({ error: '服务器错误' }, { status: 500 });
  }
}