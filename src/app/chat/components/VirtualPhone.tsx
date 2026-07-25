'use client';

interface VirtualPhoneProps {
  balance: number;
  onPhoneAction: (action: string, amount?: number) => void;
}

export default function VirtualPhone({ balance, onPhoneAction }: VirtualPhoneProps) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      right: 20,
      width: 280,
      background: '#fff',
      borderRadius: 12,
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      padding: 16,
      zIndex: 100,
    }}>
      <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>📱 小手机</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        ¥ {balance.toFixed(2)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => onPhoneAction('transfer', 5.20)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: 'none',
            background: '#07C160',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          转账 ¥5.20
        </button>
        <button
          onClick={() => onPhoneAction('cart')}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #ddd',
            background: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🛒 购物车
        </button>
      </div>
    </div>
  );
}