'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Snowflake {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  drift: number;
  driftSpeed: number;
}

export default function HomePage() {
  const router = useRouter();
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const flakes: Snowflake[] = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 8 + 2,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.6 + 0.2,
      drift: 0,
      driftSpeed: (Math.random() - 0.5) * 0.3,
    }));
    setSnowflakes(flakes);

    const interval = setInterval(() => {
      setSnowflakes((prev) =>
        prev.map((flake) => {
          let y = flake.y + flake.speed;
          let drift = flake.drift + flake.driftSpeed;
          if (y > 105) y = -5;
          if (Math.abs(drift) > 30) drift = 0;
          return { ...flake, y, drift };
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="homepage">
      {/* 背景 */}
      <div className="homepage-bg">
        <div className="homepage-gradient" />
        {snowflakes.map((flake) => (
          <div
            key={flake.id}
            className="snowflake"
            style={{
              left: `${flake.x}%`,
              top: `${flake.y}%`,
              width: `${flake.size}px`,
              height: `${flake.size}px`,
              opacity: flake.opacity,
              transform: `translateX(${flake.drift}px)`,
            }}
          />
        ))}
      </div>

      {/* 光晕 */}
      <div className="homepage-glow homepage-glow-1" />
      <div className="homepage-glow homepage-glow-2" />

      {/* 主内容 */}
      <div className="homepage-content">
        {/* 徽章 */}
        <div className="homepage-badge">❄️ AI 伴你 · 冰蓝之境</div>

        {/* 标题 */}
        <h1 className="homepage-title">AI Companion</h1>
        <p className="homepage-subtitle">
          遇见你的 AI 伙伴，开启一段温暖的对话
        </p>

        {/* 开始按钮 */}
        <button
          className="homepage-start-btn"
          onClick={() => router.push('/chat?character=xingchen')}
        >
          开始对话 →
        </button>

        {/* 特性 */}
        <div className="homepage-features">
          <div className="homepage-feature-item">
            <span className="homepage-feature-icon">🎭</span>
            <span>4 位预设角色</span>
          </div>
          <div className="homepage-feature-item">
            <span className="homepage-feature-icon">🧠</span>
            <span>长期记忆</span>
          </div>
          <div className="homepage-feature-item">
            <span className="homepage-feature-icon">💬</span>
            <span>多角色同时聊天</span>
          </div>
          <div className="homepage-feature-item">
            <span className="homepage-feature-icon">🖼️</span>
            <span>自定义头像</span>
          </div>
          <div className="homepage-feature-item homepage-feature-soon">
            <span className="homepage-feature-icon">👥</span>
            <span>群聊模式 · 即将推出</span>
          </div>
        </div>

        {/* 页脚 */}
        <div className="homepage-footer">
          AI 伴你 · 冰蓝之境 · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  );
}