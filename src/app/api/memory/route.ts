import type { Memory, Message } from '@/app/data/types';
import { createDefaultMemory } from '@/app/data/memory-defaults';

// 记忆分析 Prompt
const MEMORY_ANALYSIS_PROMPT = `你是一个记忆分析助手。请分析以下对话，提取关键信息并以 JSON 格式返回。

对话角色：AI 伴侣与用户之间的对话。

请返回以下 JSON 结构（只返回 JSON，不要包含其他内容）：
{
  "conversationSummary": "1-2句话的对话摘要，用中文",
  "newKeyFacts": ["用户新提到的事实1", "事实2"],
  "detectedMood": "用户当前情绪（happy/tired/anxious/motivated/frustrated/neutral）",
  "goalUpdates": ["新的或更新的目标"],
  "checkInTopics": ["本次对话涉及的话题关键词"],
  "weakSubjects": ["薄弱科目名称，限考研场景"],
  "studyHoursReported": 数字或null
}

分析要点：
- conversationSummary：简洁概括本次对话的核心内容
- newKeyFacts：只提取用户新分享的个人信息（专业、年级、目标院校、学习习惯等），不要重复已有信息
- detectedMood：根据用户用词和语气判断情绪状态
- goalUpdates：如果用户提到新的目标或调整了目标，提取出来
- checkInTopics：提取对话中讨论的话题关键词（如"高数"、"英语阅读"、"心态调整"）
- weakSubjects：仅在考研场景下，提取用户觉得困难或需要加强的科目
- studyHoursReported：仅当用户明确提到"学了X小时"或"复习了X小时"时记录数字，否则设为null

对话内容：`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { conversation, existingMemory, characterId } = body;

    if (!conversation || !Array.isArray(conversation) || conversation.length === 0) {
      return Response.json({ memory: existingMemory || createDefaultMemory() });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.error('DEEPSEEK_API_KEY 未配置，跳过记忆分析');
      return Response.json({ memory: existingMemory || createDefaultMemory() });
    }

    // 格式化对话文本
    const conversationText = conversation
      .map((m: Message) => {
        const role = m.role === 'user' ? '用户' : 'AI';
        return `${role}: ${m.content}`;
      })
      .join('\n');

    // 构建已有记忆的上下文
    const existingContext = existingMemory
      ? `\n\n已有的用户信息：\n已知事实: ${(existingMemory.keyFacts || []).join(', ') || '无'}\n已有目标: ${(existingMemory.userGoals || []).join(', ') || '无'}\n已有薄弱科目: ${(existingMemory.weakSubjects || []).join(', ') || '无'}`
      : '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

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
            {
              role: 'system',
              content: `${MEMORY_ANALYSIS_PROMPT}\n\n${conversationText}${existingContext}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices?.[0]?.message?.content || '';

        try {
          const analysis = JSON.parse(rawContent);

          // 合并记忆
          const merged: Memory = {
            conversationSummary: analysis.conversationSummary || existingMemory?.conversationSummary || '',
            keyFacts: [
              ...(existingMemory?.keyFacts || []),
              ...(analysis.newKeyFacts || []).filter(
                (f: string) => !(existingMemory?.keyFacts || []).includes(f)
              ),
            ].slice(0, 50), // 最多 50 条
            dailyCheckIns: [
              ...(existingMemory?.dailyCheckIns || []),
              {
                date: new Date().toISOString().split('T')[0],
                duration: 1,
                messageCount: conversation.length,
                topics: analysis.checkInTopics || [],
                mood: analysis.detectedMood || 'neutral',
              },
            ].slice(-90), // 保留最近 90 天
            totalChatTime: (existingMemory?.totalChatTime || 0) + 1,
            recentMood: analysis.detectedMood || existingMemory?.recentMood || 'neutral',
            userGoals: [
              ...(existingMemory?.userGoals || []),
              ...(analysis.goalUpdates || []).filter(
                (g: string) => !(existingMemory?.userGoals || []).includes(g)
              ),
            ].slice(0, 20),
            lastUpdated: new Date().toISOString(),
          };

          // 未央专属字段
          if (characterId === 'weiyang') {
            if (analysis.weakSubjects && analysis.weakSubjects.length > 0) {
              merged.weakSubjects = [
                ...(existingMemory?.weakSubjects || []),
                ...analysis.weakSubjects.filter(
                  (s: string) => !(existingMemory?.weakSubjects || []).includes(s)
                ),
              ];
            } else {
              merged.weakSubjects = existingMemory?.weakSubjects || [];
            }

            if (typeof analysis.studyHoursReported === 'number' && analysis.studyHoursReported > 0) {
              merged.studyHours =
                (existingMemory?.studyHours || 0) + analysis.studyHoursReported;
            } else {
              merged.studyHours = existingMemory?.studyHours || 0;
            }

            merged.examDate = existingMemory?.examDate;
          }

          return Response.json({ memory: merged });
        } catch (parseError) {
          console.error('记忆分析 JSON 解析失败:', parseError);
          // 解析失败时返回现有记忆（更新 lastUpdated）
          return Response.json({
            memory: {
              ...(existingMemory || createDefaultMemory()),
              lastUpdated: new Date().toISOString(),
            },
          });
        }
      }

      // API 调用失败，返回现有记忆
      return Response.json({
        memory: {
          ...(existingMemory || createDefaultMemory()),
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error('记忆分析 API 请求失败:', fetchError);
      return Response.json({
        memory: {
          ...(existingMemory || createDefaultMemory()),
          lastUpdated: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error('Memory API 错误:', error);
    return Response.json({ memory: createDefaultMemory() }, { status: 200 });
  }
}