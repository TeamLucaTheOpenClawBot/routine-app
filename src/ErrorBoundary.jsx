import { Component } from 'react';
import { clearState, clearSync } from './appLogic';

// 렌더/라이프사이클 오류를 잡아 **하얀 화면 대신** 안내를 보여준다(#8). 오류의 흔한 원인 중 하나는
// 손상된 저장 데이터라, 새로고침으로 안 풀릴 때 저장 데이터를 지우고 새로 시작하는 탈출구를 둔다.
// 로그는 콘솔에만 남긴다(외부 전송 없음 — 단독 사용자·프라이버시).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('앱 오류:', error, info && info.componentStack);
  }

  reload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  resetData = () => {
    if (typeof window !== 'undefined' && !window.confirm('저장된 기록을 지우고 새로 시작할까요? 되돌릴 수 없어요.')) return;
    try {
      clearState();
      clearSync();
    } catch {
      /* noop */
    }
    this.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const card = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 16, padding: '22px 20px', maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: 'var(--shadow-lg)' };
    const btn = (primary) => ({ cursor: 'pointer', width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: primary ? 'var(--color-primary)' : 'var(--color-bg)', color: primary ? '#fff' : 'var(--color-text)', border: primary ? 'none' : '1px solid var(--color-border)' });
    return (
      <div role="alert" style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#070B14', fontFamily: 'var(--font-sans)', color: 'var(--color-text)' }}>
        <div style={card}>
          <div style={{ fontSize: 34, marginBottom: 8 }} aria-hidden>😵‍💫</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>문제가 발생했어요</div>
          <div style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5, marginBottom: 18 }}>
            일시적인 오류일 수 있어요. 새로고침해 주세요. 계속되면 저장 데이터를 초기화해 볼 수 있어요.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={this.reload} style={btn(true)}>새로고침</button>
            <button type="button" onClick={this.resetData} style={btn(false)}>저장 데이터 초기화</button>
          </div>
        </div>
      </div>
    );
  }
}
