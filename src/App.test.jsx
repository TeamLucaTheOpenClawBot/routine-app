import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('App 기타찬스 UI (#16)', () => {
  // 설정 탭 → 루틴 이름 클릭 → 편집 폼(기타찬스 섹션은 편집 모드에서만 뜬다)
  const openEditForm = () => {
    fireEvent.click(screen.getByText('설정'));
    fireEvent.click(screen.getByText('운동'));
  };

  beforeEach(() => {
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
  });

  it('사유를 적어야 기타찬스가 추가된다 — 빈 사유는 거부하고 안내한다', () => {
    render(<App />);
    openEditForm();

    const input = screen.getByLabelText('기타찬스 사유');

    // 빈 사유 → 추가되지 않고 경고
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByRole('alert')).toHaveTextContent('사유를 입력해야');

    // 공백만 있어도 거부(trim)
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // 사유가 있으면 추가되고 목록에 사유가 보인다
    fireEvent.change(input, { target: { value: '장염으로 앓아누움' } });
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByText('장염으로 앓아누움')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input.value).toBe(''); // 입력창은 비워진다
  });

  it('쓰지 않은 기타찬스는 삭제할 수 있다', () => {
    render(<App />);
    openEditForm();

    fireEvent.change(screen.getByLabelText('기타찬스 사유'), { target: { value: '출장' } });
    fireEvent.click(screen.getByText('추가'));
    expect(screen.getByText('출장')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('기타찬스 삭제 — 출장'));
    expect(screen.queryByText('출장')).not.toBeInTheDocument();
  });

  it('이미 사용한 기타찬스는 사용일을 보여주고 삭제 버튼을 내린다', () => {
    // 주·월 찬스를 소진하고 b1까지 쓴 상태를 만들어 둔다.
    const key = (d) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const today = new Date();
    const usedDay = key(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
    localStorage.setItem(STORAGE_KEY, serializeState({
      routines: [routine],
      checks: { [usedDay]: { r1: { chance: 'bonus', bonusId: 'b1' } } },
      bonusChances: { r1: [{ id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z' }] },
      weekStart: 0,
      notif: true,
      remindHour: 21,
    }));
    render(<App />);
    openEditForm();

    expect(screen.getByText(`${usedDay}에 사용함`)).toBeInTheDocument();
    expect(screen.queryByLabelText('기타찬스 삭제 — 장염')).not.toBeInTheDocument();
  });
});

describe('클라우드 동기화 UI (#7 4/4)', () => {
  it('미연결 상태에서 설정에 동기화 섹션과 두 시작 옵션을 보여준다', () => {
    render(<App />);
    fireEvent.click(screen.getByText('설정'));
    expect(screen.getByText('클라우드 동기화')).toBeInTheDocument();
    expect(screen.getByText('연결 안 됨')).toBeInTheDocument();
    // 최초 시작 방식 두 가지 — 이 기기 데이터로 / 클라우드 데이터로
    expect(screen.getByText('이 기기 데이터로 시작 (클라우드에 올림)')).toBeInTheDocument();
    expect(screen.getByText('클라우드 데이터로 시작 (이 기기 기록 대체)')).toBeInTheDocument();
    // 미연결이므로 연결 해제 버튼은 없다
    expect(screen.queryByText('연결 해제')).not.toBeInTheDocument();
  });
});

describe('알림 설정 UI (#6)', () => {
  afterEach(() => {
    delete global.Notification; // 목킹이 다음 테스트로 새지 않게(#6 2단계 회귀 방지).
  });

  it('권한 granted면 시각 셀렉트를 보여주고 라벨에 반영한다', () => {
    // 권한이 있어야 실제 켜짐(remindersOn)이 되어 시각 편집이 나타난다.
    global.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
    render(<App />);
    fireEvent.click(screen.getByText('설정'));
    expect(screen.getByText('매일 리마인더')).toBeInTheDocument();
    const sel = screen.getByLabelText('알림 시각');
    fireEvent.change(sel, { target: { value: '8' } });
    expect(screen.getByText(/08:00 · 앱이 열려 있을 때 알림/)).toBeInTheDocument();
    // 잠금 화면 알림 안내(2단계). jsdom엔 PushManager가 없어 등록 버튼 자체는 안 뜨지만 안내는 있다.
    expect(screen.getByText(/잠금 화면 알림은 동기화를 켜고 이 기기를 등록/)).toBeInTheDocument();
  });

  it('알림 미지원 브라우저면 시각 셀렉트 없이 안내만 보여준다', () => {
    // jsdom 기본: Notification 없음 → unsupported → 실제 켜짐이 아니므로 시각 편집 숨김.
    render(<App />);
    fireEvent.click(screen.getByText('설정'));
    expect(screen.getByText('이 브라우저는 알림을 지원하지 않아요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('알림 시각')).not.toBeInTheDocument();
  });
});

describe('모달 접근성 (#8)', () => {
  it('루틴 편집 폼이 role="dialog"로 열리고 Esc로 닫힌다', () => {
    render(<App />);
    fireEvent.click(screen.getByText('설정'));
    fireEvent.click(screen.getByText('운동')); // 설정 루틴 행 → 편집 폼
    const dialog = screen.getByRole('dialog', { name: '루틴 편집' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '루틴 편집' })).not.toBeInTheDocument();
  });
});

describe('탭 전환 (#8)', () => {
  // 탭 버튼은 접근성 이름(= 라벨 텍스트)으로 잡는다 — 각 화면 헤딩(div)과 겹치지 않는다.
  const tab = (name) => screen.getByRole('button', { name });

  it('네 탭 사이를 오가며 각 화면을 보여준다', () => {
    render(<App />);
    // 기본은 '오늘' — 루틴별 주간 진행 텍스트(루틴마다 하나)가 이 화면에만 있다.
    expect(screen.getAllByText(/이번 주 \d/).length).toBeGreaterThan(0);

    fireEvent.click(tab('통계'));
    expect(screen.getByText('평균 달성률')).toBeInTheDocument();
    expect(screen.queryByText(/이번 주 \d/)).not.toBeInTheDocument();

    fireEvent.click(tab('설정'));
    expect(screen.getByText('데이터 초기화')).toBeInTheDocument();
    expect(screen.queryByText('평균 달성률')).not.toBeInTheDocument();

    fireEvent.click(tab('캘린더'));
    const now = new Date();
    expect(screen.getByText(`${now.getFullYear()}년 ${now.getMonth() + 1}월`)).toBeInTheDocument();

    fireEvent.click(tab('오늘'));
    expect(screen.getAllByText(/이번 주 \d/).length).toBeGreaterThan(0);
  });
});

describe('루틴 추가·편집·삭제 (#8)', () => {
  const goSettings = () => fireEvent.click(screen.getByRole('button', { name: '설정' }));

  it('설정에서 루틴을 추가하면 이름을 바꿔 저장하고 목록·새로고침에 남는다', () => {
    const first = render(<App />);
    goSettings();
    // 기본 2개 → 추가 버튼은 "루틴 추가 (2/5)"
    fireEvent.click(screen.getByText(/루틴 추가/));
    expect(screen.getByRole('dialog', { name: '루틴 추가' })).toBeInTheDocument();

    // 새 루틴 기본 이름 '새 루틴' → '명상'으로 변경 후 저장
    fireEvent.change(screen.getByDisplayValue('새 루틴'), { target: { value: '명상' } });
    fireEvent.click(screen.getByText('저장'));

    expect(screen.queryByRole('dialog', { name: '루틴 추가' })).not.toBeInTheDocument();
    expect(screen.getByText('명상')).toBeInTheDocument();

    // 새로고침(재마운트) 후에도 유지된다
    first.unmount();
    cleanup();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByText('명상')).toBeInTheDocument();
  });

  it('추가 폼을 취소하면 임시 루틴이 목록에 남지 않는다', () => {
    render(<App />);
    goSettings();
    fireEvent.click(screen.getByText(/루틴 추가/));
    fireEvent.change(screen.getByDisplayValue('새 루틴'), { target: { value: '버릴루틴' } });
    fireEvent.click(screen.getByText('취소'));

    expect(screen.queryByRole('dialog', { name: '루틴 추가' })).not.toBeInTheDocument();
    expect(screen.queryByText('버릴루틴')).not.toBeInTheDocument();
    // 기본 2개는 그대로
    expect(screen.getByText('운동')).toBeInTheDocument();
    expect(screen.getByText('음주')).toBeInTheDocument();
  });

  it('루틴이 5개면 추가 버튼이 비활성화된다', () => {
    const routines = Array.from({ length: 5 }, (_, i) => ({
      id: `r${i + 1}`, name: `루틴${i + 1}`, iconKey: 'activity', color: `#00000${i}`, goalType: 'atLeast', goalCount: 3, visible: true,
    }));
    localStorage.setItem(STORAGE_KEY, serializeState({ routines, checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByText(/루틴 추가/).closest('button')).toBeDisabled();
  });

  it('편집 폼에서 이름을 바꾸면 반영된다', () => {
    localStorage.setItem(STORAGE_KEY, serializeState({ routines: [routine], checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21 }));
    render(<App />);
    goSettings();
    fireEvent.click(screen.getByText('운동')); // 설정 루틴 행 → 편집
    fireEvent.change(screen.getByDisplayValue('운동'), { target: { value: '헬스' } });
    fireEvent.click(screen.getByText('저장'));

    expect(screen.getByText('헬스')).toBeInTheDocument();
    expect(screen.queryByText('운동')).not.toBeInTheDocument();
  });

  it('편집 폼에서 루틴을 삭제하면 목록에서 사라지고 다른 루틴은 남는다', () => {
    // 운동에 체크 하나 — 삭제 시 함께 정리되지만, 여기선 목록 제거를 확인한다.
    const key = (d) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    const today = key(new Date());
    localStorage.setItem(STORAGE_KEY, serializeState({
      routines: [
        { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 7, visible: true },
        { id: 'r2', name: '음주', iconKey: 'beer', color: '#E11D48', goalType: 'atMost', goalCount: 1, visible: true },
      ],
      checks: { [today]: { r1: true } },
      bonusChances: {},
      weekStart: 0, notif: true, remindHour: 21,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByText('운동'));
    fireEvent.click(screen.getByText('루틴 삭제'));

    expect(screen.queryByRole('dialog', { name: '루틴 편집' })).not.toBeInTheDocument();
    expect(screen.queryByText('운동')).not.toBeInTheDocument();
    expect(screen.getByText('음주')).toBeInTheDocument();
  });
});

describe('루틴 표시/숨김 (#8)', () => {
  it('설정에서 숨기면 오늘 화면에서 사라지고 다시 표시하면 돌아온다', () => {
    render(<App />); // 기본 운동·음주(둘 다 표시)
    fireEvent.click(screen.getByRole('button', { name: '설정' }));

    // 첫 행(운동)의 표시 토글 → 숨김
    const toggles = screen.getAllByText('표시');
    fireEvent.click(toggles[0]);
    expect(screen.getAllByText('숨김').length).toBeGreaterThan(0);

    // 오늘 화면엔 운동이 안 보이고 음주만 보인다
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.queryByText('운동')).not.toBeInTheDocument();
    expect(screen.getByText('음주')).toBeInTheDocument();

    // 다시 표시로 돌리면 오늘 화면에 복귀
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByText('숨김'));
    fireEvent.click(screen.getByRole('button', { name: '오늘' }));
    expect(screen.getByText('운동')).toBeInTheDocument();
  });
});

describe('데이터 초기화 (#8)', () => {
  let confirmSpy;
  afterEach(() => {
    if (confirmSpy) confirmSpy.mockRestore();
    confirmSpy = undefined;
  });

  it('확인하면 추가한 루틴이 지워지고 기본 상태로 되돌아간다', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    localStorage.setItem(STORAGE_KEY, serializeState({
      routines: [
        { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 6, visible: true },
        { id: 'r2', name: '음주', iconKey: 'beer', color: '#E11D48', goalType: 'atMost', goalCount: 1, visible: true },
        { id: 'r3', name: '명상', iconKey: 'leaf', color: '#8B5CF6', goalType: 'atLeast', goalCount: 3, visible: true },
      ],
      checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByText('명상')).toBeInTheDocument();

    fireEvent.click(screen.getByText('초기화'));
    // 기본 루틴만 남는다
    expect(screen.queryByText('명상')).not.toBeInTheDocument();
    expect(screen.getByText('운동')).toBeInTheDocument();
    expect(screen.getByText('음주')).toBeInTheDocument();
  });

  it('취소하면 아무것도 지우지 않는다', () => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    localStorage.setItem(STORAGE_KEY, serializeState({
      routines: [
        { id: 'r1', name: '운동', iconKey: 'activity', color: '#0EA5A4', goalType: 'atLeast', goalCount: 6, visible: true },
        { id: 'r3', name: '명상', iconKey: 'leaf', color: '#8B5CF6', goalType: 'atLeast', goalCount: 3, visible: true },
      ],
      checks: {}, bonusChances: {}, weekStart: 0, notif: true, remindHour: 21,
    }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.click(screen.getByText('초기화'));
    expect(screen.getByText('명상')).toBeInTheDocument();
  });
});
