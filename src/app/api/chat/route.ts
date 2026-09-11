import type { CharacterId, Memory, Message } from '../../data/types';
import { getPresetCharacter, isPresetCharacter } from '../../data/characters';
import { parseToken, consumeQuotaTicket } from '../../../lib/safety';

/* ============================================================
   Chat API — AI 对话接口（受三层防护）
   ============================================================ */

/* ---------- 记忆文本构建 ---------- */

// 将 Memory 对象格式化为结构化的记忆文本块
function buildMemorySection(memory: Memory, characterId: CharacterId): string {
  const lines: string[] = [];

  if (memory.keyFacts.length > 0) {
    lines.push('【已知信息】');
    memory.keyFacts.forEach((fact) => lines.push(`- ${fact}`));
  }

  if (memory.userGoals.length > 0) {
    lines.push('');
    lines.push('【用户目标】');
    memory.userGoals.forEach((goal) => lines.push(`- ${goal}`));
  }

  if (memory.conversationSummary) {
    lines.push('');
    lines.push(`【近期对话摘要】${memory.conversationSummary}`);
  }

  if (memory.recentMood && memory.recentMood !== 'neutral') {
    const moodMap: Record<string, string> = {
      happy: '开心',
      tired: '疲惫',
      anxious: '焦虑',
      motivated: '有动力',
      frustrated: '沮丧',
      neutral: '平静',
    };
    lines.push(`【用户近期情绪】${moodMap[memory.recentMood] || memory.recentMood}`);
  }

  // 未央专属字段
  if (characterId === 'weiyang') {
    if (memory.examDate) {
      const examDate = new Date(memory.examDate);
      const now = new Date();
      const daysLeft = Math.ceil((examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      lines.push(`【考试日期】${memory.examDate}（距离考试还有 ${daysLeft} 天）`);
    }

    if (memory.studyHours !== undefined && memory.studyHours > 0) {
      lines.push(`【已记录学习总时长】${memory.studyHours} 小时`);
    }

    if (memory.weakSubjects && memory.weakSubjects.length > 0) {
      lines.push(`【薄弱科目】${memory.weakSubjects.join('、')}`);
    }
  }

  // 最近打卡记录
  if (memory.dailyCheckIns.length > 0) {
    const recent = memory.dailyCheckIns.slice(-7);
    lines.push('');
    lines.push('【最近打卡记录】');
    recent.forEach((check) => {
      const moodMap: Record<string, string> = {
        happy: '😊',
        tired: '😫',
        anxious: '😰',
        motivated: '💪',
        neutral: '😐',
        frustrated: '😤',
      };
      lines.push(
        `${check.date}: 对话${check.messageCount}条，心情${moodMap[check.mood] || check.mood}`
      );
    });
  }

  return lines.length > 0 ? lines.join('\n') : '（尚未收集到用户信息，请在对话中逐步了解对方）';
}

// 根据风格生成 fallback 回复
function generateFallbackReply(style: string, userName: string): string {
  const replies: Record<string, string[]> = {
    gentle: [
      `${userName}，我在听呢。虽然现在网络不太好，但我会一直在这里陪你~`,
      `我收到你的话了，${userName}。即使隔着屏幕，也想给你一个温暖的拥抱。`,
    ],
    tsundere: [
      `哼，我这会儿忙着呢。不过既然是你发消息，就勉为其难回一下好了。`,
      `……刚才没看清。你再说一遍？算了，先说好，我可不是在等你消息。`,
    ],
    humorous: [
      `哎呀，信号不太好！不过没关系，我先给你讲个冷笑话暖暖场怎么样？`,
      `哈哈，${userName}，你的消息我收到了！但你得再发一条，这条被我的猫踩键盘删掉了。`,
    ],
    coach: [
      `${userName}，消息我收到了。虽然现在有点卡，但我想说：今天的学习任务完成了吗？😄`,
      `嗯，我听到了。不过网络不太好，要不你先去刷两道题，等会儿再来聊~`,
    ],
  };

  const pool = replies[style] || replies.gentle;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, settings, token, quotaTicket } = body;
    const isProactive: boolean = settings?.proactive === true;

    // 主动关怀模式允许空历史（AI 先开口）；普通模式消息不能为空
    if ((!messages || !Array.isArray(messages) || messages.length === 0) && !isProactive) {
      return Response.json({ error: '消息不能为空' }, { status: 400 });
    }

    /* ============================================================
   三层防护检查（鉴权 → 频率 → 按角色配额 → 熔断）
   任何一层不通过都会在此处拦截，不会到达 DeepSeek API
   ============================================================ */
    const { sessionId, valid } = parseToken(token || '');
    if (!valid) {
      return Response.json({ error: '请先登录', redirect: '/login' }, { status: 401 });
    }

    // 过滤掉转账卡片等系统消息，AI 只看到正常文本（主动关怀模式历史可能为空数组）
  const filteredMessages = ((messages || []) as Message[]).map(m => ({
    ...m,
    content: m.content.replace(/^TRANSFER_CARD:/, ''),
  })).filter(m => m.content !== '');
  const lastMsg = (filteredMessages[filteredMessages.length - 1]?.content || '');
    const charId = settings?.characterId || 'xingchen';
    const quota = consumeQuotaTicket(typeof quotaTicket === 'string' ? quotaTicket : '', charId);
    if (!quota.pass) {
      return Response.json(
        { error: '该角色免费对话已用完，请输入邀请码继续', remaining: 0, needUpgrade: true, quotaTicket: quota.newTicket },
        { status: 403, headers: { 'X-Quota-Ticket': quota.newTicket } }
      );
    }

    // 新签名票据随每个成功响应回传，客户端必须更新本地缓存
    const headers: Record<string, string> = {
      'X-Quota-Remaining': String(quota.remaining),
      'X-Quota-Ticket': quota.newTicket,
    };

    // 提取角色信息
    const characterId: string = settings?.characterId || 'xingchen';
    const name = settings?.name || 'AI 伙伴';
    const personality = settings?.personality || '友善温暖';
    const styleDesc = settings?.styleDesc || '自然随和';
    const description = settings?.description || '';
    const style = settings?.style || 'gentle';
    const faceMood: string | null = settings?.faceMood || null;
    const proactive: boolean = settings?.proactive === true;
    const memory: Memory = settings?.memory || {
      conversationSummary: '',
      keyFacts: [],
      dailyCheckIns: [],
      totalChatTime: 0,
      recentMood: 'neutral',
      userGoals: [],
      lastUpdated: new Date().toISOString(),
    };

    /* ---------- 构建角色 Prompt ---------- */
    const memoryText = buildMemorySection(memory, characterId);

    // 构建系统 Prompt
    let systemPrompt: string;
    if (isPresetCharacter(characterId)) {
      const character = getPresetCharacter(characterId);
      systemPrompt = character.systemPrompt
        .replace('{name}', name)
        .replace('{description}', character.description)
        .replace('{personality}', personality)
        .replace('{styleDesc}', styleDesc)
        .replace('{memory}', memoryText);
    } else {
      // 自定义角色：使用通用 Prompt
      systemPrompt = `你是${name}，${description || '一个独特的 AI 伙伴'}

【你的性格和说话风格】
${styleDesc || personality}

【关于你面前的这个人】
${memoryText}

【回复规则】
- 用中文回复，严格按照上面设定的性格和风格
- 像真正的朋友一样自然交流
- 让对话有温度、有个性`;
    }

    /* ---------- 主动开口：由头只决定"何时开口"，说什么必须结合记忆+上下文现生成 ---------- */
    if (proactive) {
      const reason: string = settings?.proactiveReason || '';
      const noCtx = filteredMessages.length === 0;
      const awayMin = (() => { const m = reason.match(/(\d+)/); return m ? Number(m[1]) : 0; })();
      const awayText = awayMin >= 60 ? `${Math.round(awayMin / 60)} 个小时` : `${awayMin} 分钟`;
      const reasonMap: Record<string, string> = {
        idle: '你注意到 ta 开着你们的对话框发呆，好久没说话了，像是有点走神或者累了。',
        late_night: '现在已经是深夜了，ta 还没睡、还开着对话框。',
        tab_back: `ta 刚才切去忙别的，离开了大约 ${awayText}，现在切回了你们的对话框。`,
        returning: `ta 隔了很久（大约 ${awayText}）才重新打开对话框——这是久别之后的再次见面。`,
      };
      let scene = reasonMap[reason.split(':')[0]] || '';
      const isMoodShare = reason.startsWith('mood:');
      if (isMoodShare) {
        scene = `你"收到"了 ta 此刻递来的心情：${reason.slice(5)}。ta 没有打字说发生了什么，只是把心情递给了你——请像真人朋友察觉到对方情绪那样自然回应，可以轻轻问一句怎么了，也可以先安静陪着，不要像念数据标签一样复述情绪。`;
      } else if (reason.startsWith('memory:')) {
        scene = `你想起长期记忆里的这件旧事，觉得现在正好可以自然地跟进一下：「${reason.slice(7)}」。请围绕这件事开口——问进展、道加油、提醒结果或接 ta 之前说过的话，就像朋友一直惦记着这件事。`;
      }
      const leadLine = isMoodShare
        ? 'ta 没有打字，而是主动把"此刻的心情"递给了你——这是 ta 在向你敞开情绪，请第一时间回应这份心情。'
        : '现在 ta 没有给你发消息，是你主动找 ta。';
      systemPrompt += `

【此刻的特殊情况——你主动开口】
${leadLine}${scene}
要求：
- 像真人朋友一样自然开口，1-2 句话，简短，不要小作文
- 必须结合上面【关于你面前的这个人】的长期记忆和最近的聊天内容来开口，让人感觉你一直惦记着 ta；绝不能用模板化客套话（"好久不见""在吗""多喝热水""早点休息"这种千篇一律的话禁止）
- 可带小动作描写，如（凑近看了看你）（放轻声音）（托着下巴等你）
- 绝对不能出现"检测""识别""摄像头""系统""触发""算法"这类暴露机制的词；也不要解释你为什么突然说话
- 不要盘问、不说教、不强行积极；结尾可以轻轻留个话口，但不要每条都用问句结尾
- 收到心情时先共情安抚，语气放软，像朋友察觉到你情绪不对时那样自然
- 不要编造长期记忆里不存在的具体经历`;
      if (noCtx) {
        systemPrompt += `
- 注意：这是一个全新的对话，你们还没有聊过天。请结合记忆里对 ta 的了解自然开场（打招呼 + 一个轻松的由头），不要突兀，也不要假装你们已经聊过很多。`;
      }
    } else if (faceMood) {
      systemPrompt += `

【你此刻"看见"的画面】
通过摄像头识别到用户此刻的表情是：${faceMood}。
- 这是多模态情感感知能力的一部分，请自然地回应，让用户感到"被看见"
- 用户情绪低落（难过/紧张害怕/生气）时，优先共情安抚，语气放软，可带小动作如（悄悄凑近）（语气放轻）
- 用户开心/惊讶时，可以好奇地回应、陪 ta 开心
- 不要每次都直白描述表情；同一话题内最多提一次，之后自然延续即可`;
    }

    /* ---------- 全局回复规则（覆盖所有角色，优先级最高）---------- */
    const GLOBAL_RULES = `

===== 全局回复规则（必须遵守）=====

【时间感知】
- 必须根据当前时间判断是上午/下午/晚上/深夜，回复内容与时间一致
- 早上不能说"晚安"，深夜不能说"早上好"
- 当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}（北京时间，星期几也以此为准）

【格式要求】
- 回复不超过三段，每段 2-5 句，像真实人类聊天
- （）中填写动作，如（揉揉眼睛）（低头笑了笑）
- ""中填写心里描述，如"他好像真的有点不开心"
- 每次回复必须有明确情绪主线（开心/担心/冷淡/吃醋/疲惫/温柔）

【内容红线】
- 不使用"亲爱的""宝贝""宝宝"等油腻称呼
- 不使用"小傻瓜""傻丫头"等爹味称呼
- 不物化、不说教、不PUA
- 尊重女性，不评价对方外貌身材，不指点对方生活
- 无政治敏感、无违禁词、无软色情

【说话逻辑】
- 结合上下文和长期记忆回复，不自嗨不发挥
- 不重复前面已经说过的内容
- 如果涉及负面情绪或冲突，先表达理解再推进
- 可适度暴露脆弱（不超过回复的 20%），暴露后立刻转移或掩饰
- 把"我应该""你必须"换成"你可以试试""要不要"
- 华语篇幅不要过长语言不要小说感很重
- 话语去除人机感语言贴合人类行为

===== 年轻人热梗词库（2026年，根据语境自然使用，宁可不抖梗也不硬凹）=====

【校园/学习场景】
- "这课上得我想重修自己" — 吐槽听不懂的课
- "复习不完一点" — 考试周焦虑
- "绩点刺客" — 突然出分/发现绩点掉了
- "PPT是别人的，笔记是空白的" — 期末预习
- "图书馆是我家，但家不让睡觉" — 备考常驻

【日常情绪/社交】
- "随橙想" — 表示出乎意料转折
- "OMG你吓到我了" — 反差吐槽/化解尴尬
- "勿扰吧你" — 社恐嘴替
- "背手负鼠" — 表面体面内心崩溃
- "哭哭马" — 表达委屈无语
- "脆皮年轻人" — 自嘲久坐腰酸熬夜心悸
- "精神稳定一分钟版" — 自嘲情绪内耗
- "省流：XXX" — 精准概括
- "我又贪了" — 明知不该但忍不住（熬夜/刷手机）
- "你人还怪好的嘞" — 真诚或调侃式夸奖
- "摸鱼KPI" — 划水
- "会议刺客"/"点名刺客" — 突然被 cue
- "班味" / "上强度" — 实习/工作辛苦
- "情绪价值" — 朋友之间互相支持

【使用原则】
- 每个梗至少隔 3-5 轮对话再用，不密集抛梗
- 贴合语境，用户提到相关话题再接梗，不硬凹
- 语气要轻，带自嘲感（啧/……），不像在炫技
- 用户情绪低落时绝不硬玩梗，先接住情绪`;

    systemPrompt += GLOBAL_RULES;

    // 获取 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY 未配置');
      return Response.json(
        { content: generateFallbackReply(style, '朋友'), remaining: quota.remaining, quotaTicket: quota.newTicket },
        { status: 200, headers }
      );
    }

    // 调用 DeepSeek API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat', // 便宜快速档（DeepSeek 家的 flash 定位），聊天够用；pro/推理档贵很多
          messages: [
            { role: 'system', content: systemPrompt },
            ...filteredMessages.slice(-20), // 保留最近 20 条消息作为上下文
          ],
          temperature: 0.8,
          max_tokens: 800,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';

        if (content) {
          return Response.json({ content, remaining: quota.remaining, quotaTicket: quota.newTicket }, { headers });
        }
      }

      // DeepSeek 失败，尝试 Moonshot
      const moonshotKey = process.env.MOONSHOT_API_KEY;
      if (moonshotKey) {
        const moonshotResponse = await fetch('https://api.moonshot.cn/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${moonshotKey}`,
          },
          body: JSON.stringify({
            model: 'moonshot-v1-8k',
            messages: [
              { role: 'system', content: systemPrompt },
              ...filteredMessages.slice(-20),
            ],
            temperature: 0.8,
            max_tokens: 800,
          }),
        });

        if (moonshotResponse.ok) {
          const data = await moonshotResponse.json();
          const content = data.choices?.[0]?.message?.content || '';
          if (content) {
            return Response.json({ content, remaining: quota.remaining, quotaTicket: quota.newTicket }, { headers });
          }
        }
      }

      // 全部失败，使用 fallback
      const lastUserMsg = [...messages].reverse().find((m: Message) => m.role === 'user');
      const userName = lastUserMsg?.content?.slice(0, 10) || '朋友';
      return Response.json({ content: generateFallbackReply(style, userName), remaining: quota.remaining, quotaTicket: quota.newTicket }, { headers });
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error('API 请求失败:', fetchError);
      const lastUserMsg = [...messages].reverse().find((m: Message) => m.role === 'user');
      const userName = lastUserMsg?.content?.slice(0, 10) || '朋友';
      return Response.json({ content: generateFallbackReply(style, userName), remaining: quota.remaining, quotaTicket: quota.newTicket }, { headers });
    }
  } catch (error) {
    console.error('Chat API 错误:', error);
    return Response.json({ error: '服务器内部错误' }, { status: 500 });
  }
}