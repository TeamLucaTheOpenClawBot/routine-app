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

describe('App 찬스 3-상태 (#16)', () => {
  // atLeast 루틴: 안함 → 했음(+1) → 찬스(여전히 +1, 출처는 주찬스) → 안함(0)
  it('탭할 때마다 안함 → 했음 → 찬스 → 안함으로 순환한다', () => {
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
    render(<App />);

    expect(screen.getByText('이번 주 0/7회')).toBeInTheDocument();
    expect(screen.getByLabelText('미완료')).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // → 했음
    expect(screen.getByText('이번 주 1/7회')).toBeInTheDocument();
    expect(screen.getByLabelText('완료')).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // → 찬스 (atLeast라 여전히 1회로 집계)
    expect(screen.getByText('이번 주 1/7회')).toBeInTheDocument();
    expect(screen.getByLabelText('찬스로 킵함')).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // → 안함
    expect(screen.getByText('이번 주 0/7회')).toBeInTheDocument();
    expect(screen.getByLabelText('미완료')).toBeInTheDocument();
  });

  it('찬스를 쓰면 보유 배지가 줄고, 되돌리면 복원된다', () => {
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
    render(<App />);

    expect(screen.getByLabelText(/남은 찬스 2개/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // 했음
    fireEvent.click(screen.getByText('운동')); // 찬스 → 주찬스 소진
    expect(screen.getByLabelText(/남은 찬스 1개 — 주 0, 월 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // 되돌림 → 사용 기록이 사라져 잔여 복원
    expect(screen.getByLabelText(/남은 찬스 2개/)).toBeInTheDocument();
  });

  it('보유 찬스가 없으면 찬스 단계를 건너뛰고 안내를 띄운다', () => {
    // 주/월 찬스를 이미 이번 주·이번 달에 소진해 둔 상태로 시작한다.
    // App은 startOfToday()로 실제 날짜를 쓰므로(주입 불가) 고정 날짜를 못 넣는다 →
    // '오늘'을 기준으로 충돌 없는 날짜를 계산한다. 단순히 주 시작일과 1일을 쓰면
    // 그 둘이 같은 날인 달(일요일이 1일)에 키가 겹쳐 주찬스가 소진되지 않는다.
    const today = new Date();
    const key = (d) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const todayKey = key(today);

    // 주찬스: 이번 주 안에서 오늘이 아닌 하루.
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
    const weeklyDay = key(sunday) === todayKey
      ? new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1)
      : sunday;

    // 월찬스: 이번 달 안에서 오늘도 주찬스일도 아닌 하루.
    const taken = new Set([todayKey, key(weeklyDay)]);
    let monthlyDay = null;
    for (let d = 1; d <= 28 && !monthlyDay; d += 1) {
      const cand = new Date(today.getFullYear(), today.getMonth(), d);
      if (!taken.has(key(cand))) monthlyDay = cand;
    }

    const spent = {
      [key(weeklyDay)]: { r1: { chance: 'weekly' } },
      [key(monthlyDay)]: { r1: { chance: 'monthly' } },
    };
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: spent, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
    render(<App />);

    expect(screen.getByLabelText(/남은 찬스 0개/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // 안함 → 했음
    expect(screen.getByLabelText('완료')).toBeInTheDocument();

    fireEvent.click(screen.getByText('운동')); // 찬스 건너뛰고 → 안함
    expect(screen.getByLabelText('미완료')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('남은 찬스가 없어요');
  });
});
