import fs from 'fs';

const pageContent = String.raw`'use client';

import { useState, useEffect } from 'react';

// ========== 冰晶粒子动画 ==========
function Snowflake({ style }: { style: React.CSSProperties }) {
  return (
    <div
      style={{
        position: 'absolute',
        width: 6 + Math.random() * 8,
        height: 6 + Math.random() * 8,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), rgba(186,230,253,0.4))',
        boxShadow: '0 0 20px rgba(186,230,253,0.3)',
        animation: 'snowdrift 15s linear infinite',
        animationDelay: ${Math.random() * 20}s,
        opacity: 0.5 + Math.random() * 0.5,
        ...style,
      }}
    />
  );
}

export default function Home() {
  const [particles, setParticles] = useState<React.CSSProperties[]>([]);

  useEffect(() => {
    const arr = Array.from({ length: 30 }, (_, i) => ({
      left: ${Math.random() * 100}%,
      top: ${Math.random() * 100}%,
      width: 4 + Math.random() * 10,
      height: 4 + Math.random() * 10,
    }));
    setParticles(arr);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 40%, #dbeafe 70%, #f0f9ff 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <style>{
        @keyframes snowdrift {
          0% { transform: translateY(-10vh) translateX(0px) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(110vh) translateX(80px) scale(0.5); opacity: 0; }
        }
        @keyframes floatGlow1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(80px, -50px) scale(1.2); opacity: 0.8; }
        }
        @keyframes floatGlow2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-60px, 40px) scale(1.1); opacity: 0.6; }
        }
        @keyframes floatGlow3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, 60px) scale(0.9); opacity: 0.7; }
        }
      }</style>

      {/* 漂浮光晕背景 */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(186,230,253,0.35), transparent 60%)',
          top: '10%',
          left: '5%',
          animation: 'floatGlow1 20s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(147,197,253,0.3), transparent 60%)',
          bottom: '15%',
          right: '10%',
          animation: 'floatGlow2 25s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(191,219,254,0.25), transparent 60%)',
          top: '50%',
          left: '60%',
          animation: 'floatGlow3 18s ease-in-out infinite',
        }} />

        {/* 冰晶粒子 */}
        {particles.map((p, i) => (
          <Snowflake key={i} style={p} />
        ))}
      </div>

      {/* 中央毛玻璃卡片 */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        width: 480,
        maxWidth: '92%',
        padding: '48px 40px',
        borderRadius: 32,
        background: 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.4)',
        boxShadow: '0 20px 60px rgba(56,189,248,0.15), inset 0 1px 0 rgba(255,255,255,0.6)',
        textAlign: 'center',
      }}>
        {/* 小徽章 */}
        <div style={{
          display: 'inline-block',
          padding: '6px 16px',
          borderRadius: 50,
          background: 'rgba(56,189,248,0.15)',
          border: '1px solid rgba(56,189,248,0.3)',
          color: '#0c4a6e',
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.5px',
          marginBottom: 24,
        }}>
          ❄️ 冰蓝之境
        </div>

        {/* 标题 */}
        <h1 style={{
          fontSize: 48,
          fontWeight: 700,
          color: '#0c4a6e',
          marginBottom: 8,
          textShadow: '0 0 40px rgba(56,189,248,0.1)',
          letterSpacing: '-0.5px',
        }}>
          AI Companion
        </h1>
        <p style={{
          fontSize: 16,
          color: '#1e80b0',
          marginBottom: 40,
          lineHeight: 1.6,
        }}>
          你的冰蓝之境 · 纯净智能伴侣
        </p>

        {/* 三个特色标签 */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 36,
          flexWrap: 'wrap',
        }}>
          {['智能对话', '永久记忆', '自定义角色'].map((text) => (
            <span
              key={text}
              style={{
                padding: '6px 16px',
                borderRadius: 50,
                background: 'rgba(255,255,255,0.3)',
                border: '1px solid rgba(255,255,255,0.5)',
                color: '#0c4a6e',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {text}
            </span>
          ))}
        </div>

        {/* CTA 按钮 */}
        <a
          href="/chat"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '14px 40px',
            borderRadius: 50,
            background: 'linear-gradient(135deg, #0ea5e9, #7dd3fc)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 8px 30px rgba(56,189,248,0.3)',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            border: 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(56,189,248,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,189,248,0.3)'; }}
        >
          ✨ 开始对话
        </a>

        <p style={{
          marginTop: 16,
          fontSize: 12,
          color: 'rgba(12,74,110,0.5)',
        }}>
          无需注册 · 数据本地保存
        </p>
      </div>

      {/* 底部小字 */}
      <div style={{
        position: 'absolute',
        bottom: 24,
        zIndex: 10,
        fontSize: 12,
        color: 'rgba(12,74,110,0.35)',
        letterSpacing: '1px',
      }}>
        ❄️ AI 伴你 · 冰蓝之境
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/app/page.tsx', pageContent, 'utf8');
console.log('✅ Homepage written');