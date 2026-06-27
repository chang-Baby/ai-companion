import type { CharacterId, Memory, Message } from '../../data/types';
import { getPresetCharacter, isPresetCharacter } from '../../data/characters';

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
    const { messages, settings } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: '消息不能为空' }, { status: 400 });
    }

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

    // 构建记忆文本
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
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.slice(-20), // 保留最近 20 条消息作为上下文
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
          return Response.json({ content });
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
              ...messages.slice(-20),
            ],
            temperature: 0.8,
            max_tokens: 800,
          }),
        });

        if (moonshotResponse.ok) {
          const data = await moonshotResponse.json();
          const content = data.choices?.[0]?.message?.content || '';
          if (content) {
            return Response.json({ content });
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