export default function AboutPage() {
  return (
    <div className="about-page">
      <div className="about-content">
        <h1 className="about-title">关于 AI Companion</h1>
        <p className="about-text">
          AI Companion 是你的人工智能伙伴。
          <br />
          现在有 4 位独特的 AI 角色可以陪伴你——温柔的星尘、傲娇的墨离、幽默的云曦，
          还有专门帮你备战考研的未央学长/学姐。
        </p>
        <p className="about-text" style={{ marginTop: '16px', fontSize: '14px' }}>
          每位角色都有长期记忆，能记住你们的对话、你的状态和目标。
          <br />
          你可以同时和多位角色聊天，随时切换，每个角色的对话都独立保存。
        </p>
        <a href="/" className="about-back">
          ← 返回首页
        </a>
      </div>
    </div>
  );
}