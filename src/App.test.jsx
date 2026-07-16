import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { STORAGE_KEY, serializeState } from './appLogic';

const routine = { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true };

beforeEach(() => {
  localStorage.clear();
});

describe('App persistence (#2)', () => {
  it('seeds 운동·음주 defaults on a fresh install — no prototype demo seed', () => {
    render(<App />);
    // 첫 방문 기본 루틴은 운동·음주 2개.
    expect(screen.getByText('운동')).toBeInTheDocument();
    expect(screen.getByText('음주')).toBeInTheDocument();
    // 프로토타입 데모 루틴(물 마시기/독서)은 더 이상 뜨지 않는다.
    expect(screen.queryByText('물 마시기')).not.toBeInTheDocument();
    expect(screen.queryByText('독서')).not.toBeInTheDocument();
    // 빈 상태(온보딩)가 아니다.
    expect(screen.queryByText('첫 루틴 만들기')).not.toBeInTheDocument();
  });

  it('drops the mockup phone frame — no fake status bar (#3)', () => {
    render(<App />);
    // 가짜 상태바(9:41 · 5G)가 제거돼 실제 전체화면 레이아웃으로 렌더된다.
    expect(screen.queryByText('9:41')).not.toBeInTheDocument();
    expect(screen.queryByText('5G')).not.toBeInTheDocument();
  });

  it('restores a checked routine after remount (survives refresh)', () => {
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: {}, weekStart: 0, notif: true, remindHour: 21 }));

    const first = render(<App />);
    expect(screen.getByText('운동')).toBeInTheDocument();
    expect(screen.getByText('이번 주 0/7회')).toBeInTheDocument();

    // 오늘 탭에서 루틴 행을 탭 → 체크. 저장 effect가 localStorage에 반영한다.
    fireEvent.click(screen.getByText('운동'));
    expect(screen.getByText('이번 주 1/7회')).toBeInTheDocument();

    first.unmount();
    cleanup();

    // 새로고침 시뮬레이션(재마운트) → 체크가 유지된다.
    render(<App />);
    expect(screen.getByText('이번 주 1/7회')).toBeInTheDocument();
  });
});
