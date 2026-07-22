import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Boom() {
  throw new Error('터졌다');
}

afterEach(cleanup);

describe('ErrorBoundary (#8)', () => {
  it('자식이 던지면 하얀 화면 대신 안내와 복구 버튼을 보여준다', () => {
    // 경계가 잡는 오류는 콘솔에 찍히므로 테스트 노이즈를 줄인다.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('문제가 발생했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장 데이터 초기화' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('자식이 정상이면 그대로 렌더한다', () => {
    render(
      <ErrorBoundary>
        <div>정상 콘텐츠</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('정상 콘텐츠')).toBeInTheDocument();
    expect(screen.queryByText('문제가 발생했어요')).not.toBeInTheDocument();
  });
});
