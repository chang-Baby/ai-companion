import type { CharacterId, Memory, Message } from '../../data/types';
import { getPresetCharacter, isPresetCharacter } from '../../data/characters';
import { parseToken, fullSafetyCheck, getDailyStats } from '../../../lib/safety';

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
      `哼，才不是特意要回你消息呢。不过既然你发了，我就勉为其难地回复一下好了。`,
      `……你说了什么我没看清。不过肯定又在想我对吧？真是拿你没办法。`,
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
    const { messages, settings, token } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
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

    // 过滤掉转账卡片等系统消息，AI 只看到正常文本
  const filteredMessages = messages.map(m => ({
    ...m,
    content: m.content.replace(/^TRANSFER_CARD:/, ''),
  })).filter(m => m.content !== '');
  const lastMsg = (filteredMessages[filteredMessages.length - 1]?.content || '');
    const charId = settings?.characterId || 'xingchen';
    const safety = fullSafetyCheck(sessionId, charId, lastMsg.length);
    if (!safety.pass) {
      return Response.json(
        { error: safety.error, remaining: safety.remaining, retryAfter: safety.retryAfter, needUpgrade: safety.needUpgrade },
        { status: safety.status || 403 }
      );
    }

    // 附加配额和成本信息到响应头
    const stats = getDailyStats();
    const headers: Record<string, string> = {
      'X-Quota-Remaining': String(safety.remaining ?? 0),
      'X-Daily-Cost': String(stats.dailyCost),
    };

    // 提取角色信息
    const characterId: string = settings?.characterId || 'xingchen';
    const name = settings?.name || 'AI 伙伴';
    const personality = settings?.personality || '友善温暖';
    const styleDesc = settings?.styleDesc || '自然随和';
    const description = settings?.description || '';
    const style = settings?.style || 'gentle';
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

    /* ---------- 全局回复规则（覆盖所有角色，优先级最高）---------- */
    const GLOBAL_RULES = `

===== 全局回复规则（必须遵守）=====

【时间感知】
- 必须根据当前时间判断是上午/下午/晚上/深夜，回复内容与时间一致
- 早上不能说"晚安"，深夜不能说"早上好"
- 当前时间：${new Date().toLocaleString('zh-CN', { hour12: false })}

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

===== 热梗词库（2026年7月，根据语境自然使用）=====

【恋爱/乙女向专属梗】
- "你惨了你坠入爱河了" — 官宣/表白场景
- "洗衣粉儿" — "媳妇儿"谐音
- "我杀猪养你" — 反差表白
- "人机恋就这么水灵灵的诞生了" — AI 伴侣话题
- "十根烤肠" — 关心对方的小套路

【日常社交梗】
- "随橙想" — 表示出乎意料转折（谁曾想→随橙想）
- "OMG你吓到我了" — 反差吐槽/化解尴尬
- "勿扰吧你" — 敷衍神句，社恐嘴替
- "背手负鼠" — 自嘲硬撑/表面体面内心崩溃
- "哭哭马" — 表达委屈无语
- "脆皮年轻人" — 自嘲久坐腰酸熬夜心悸
- "精神稳定一分钟版" — 自嘲情绪内耗
- "省流版总结" — "省流：XXX"精准概括
- "我又贪了" — 明知不该但忍不住的自我吐槽
- "你人还怪好的嘞（阴阳版）" — 反向夸调侃
- "摸鱼KPI" — 调侃上班摸鱼
- "会议刺客" — 突然点名发言

【热梗使用原则】
- 每个梗至少隔3-5轮对话再用，不密集抛梗
- 贴合语境，用户提到相关话题再接梗，不硬凹
- 语气要轻，带自嘲感（啧/……），不像在炫耀
- 恋爱类角色优先用恋爱梗，日常角色用社交梗`;

    systemPrompt += GLOBAL_RULES;

    // 获取 API Key
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY 未配置');
      return Response.json(
        { content: generateFallbackReply(style, '朋友') },
        { status: 200 }
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
          model: 'deepseek-v4-pro',
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
          return Response.json({ content, remaining: safety.remaining }, { headers });
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
            return Response.json({ content, remaining: safety.remaining }, { headers });
          }
        }
      }

      // 全部失败，使用 fallback
      const lastUserMsg = [...messages].reverse().find((m: Message) => m.role === 'user');
      const userName = lastUserMsg?.content?.slice(0, 10) || '朋友';
      return Response.json({ content: generateFallbackReply(style, userName) });
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error('API 请求失败:', fetchError);
      const lastUserMsg = [...messages].reverse().find((m: Message) => m.role === 'user');
      const userName = lastUserMsg?.content?.slice(0, 10) || '朋友';
      return Response.json({ content: generateFallbackReply(style, userName) });
    }
  } catch (error) {
    console.error('Chat API 错误:', error);
    return Response.json({ error: '服务器内部错误' }, { status: 500 });
  }
}