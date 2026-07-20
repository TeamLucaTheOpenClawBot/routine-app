import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, openDatabase } from './store.js';

const ME = 'me@example.com';
let store;

beforeEach(() => {
  store = createStore(openDatabase(':memory:'));
});

const cell = (dateKey, routineId, value, ts) => ({ dateKey, routineId, value, ts });
const find = (out, dateKey, routineId) => out.cells.find((c) => c.dateKey === dateKey && c.routineId === routineId);

describe('sync — 셀 단위 merge', () => {
  it('밀어넣은 변경을 돌려주고 커서를 전진시킨다', () => {
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    expect(find(out, '2026-07-20', 'r1').value).toBe(true);
    expect(out.cursor).toBeGreaterThan(0);
  });

  it('서로 다른 칸은 둘 다 살아남는다 — 전체 문서 LWW였다면 하나가 사라진다', () => {
    // 폰: 어제 칸 / 데스크톱: 오늘 칸 (오프라인에서 각각 편집한 상황)
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-19', 'r1', true, 100)] });
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 101)] });

    expect(find(out, '2026-07-19', 'r1').value).toBe(true);
    expect(find(out, '2026-07-20', 'r1').value).toBe(true);
  });

  it('같은 칸이 충돌하면 ts가 큰 쪽이 이긴다', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 200)] });
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', { chance: 'weekly' }, 300)] });
    expect(find(out, '2026-07-20', 'r1').value).toEqual({ chance: 'weekly' });
  });

  it('오래된 쓰기는 최신을 덮지 못한다 (늦게 도착해도)', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', { chance: 'weekly' }, 300)] });
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 200)] });
    // 서버가 채택한 값을 그대로 돌려주므로 클라이언트가 '내 쓰기가 졌다'를 알 수 있다.
    expect(find(out, '2026-07-20', 'r1').value).toEqual({ chance: 'weekly' });
  });

  it('같은 ts 재전송은 순서를 뒤집지 않는다 (멱등)', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'first', 100)] });
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'second', 100)] });
    expect(find(out, '2026-07-20', 'r1').value).toBe('first');
  });

  it('삭제(null)도 전파된다 — 툼스톤이라 다른 기기가 되돌리지 않는다', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    const out = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', null, 200)] });
    expect(find(out, '2026-07-20', 'r1').value).toBe(null);
  });
});

describe('sync — 커서', () => {
  it('커서 이후 변경만 돌려준다', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-19', 'r1', true, 100)] });
    const second = store.sync(ME, { cursor: first.cursor, cells: [cell('2026-07-20', 'r1', true, 101)] });

    expect(second.cells.map((c) => c.dateKey)).toEqual(['2026-07-20']); // 이전 것은 다시 안 옴
  });

  it('커서 0이면 전체를 돌려준다 (첫 동기화·재설치)', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-19', 'r1', true, 100)] });
    store.sync(ME, { cursor: first.cursor, cells: [cell('2026-07-20', 'r1', true, 101)] });

    const full = store.sync(ME, { cursor: 0 });
    expect(full.cells).toHaveLength(2);
  });

  it('변경 없이 호출해도 커서가 뒤로 가지 않는다', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    const idle = store.sync(ME, { cursor: first.cursor });
    expect(idle.cells).toEqual([]);
    expect(idle.cursor).toBe(first.cursor);
  });

  it('커서는 서버 seq라 클라이언트 시계가 뒤로 가도 변경을 놓치지 않는다', () => {
    const a = store.sync(ME, { cursor: 0, cells: [cell('2026-07-19', 'r1', true, 9999)] });
    // 다음 쓰기의 ts가 더 작아도(시계 역행) seq는 계속 증가한다
    const b = store.sync(ME, { cursor: a.cursor, cells: [cell('2026-07-20', 'r1', true, 1)] });
    expect(b.cursor).toBeGreaterThan(a.cursor);
    expect(b.cells.map((c) => c.dateKey)).toEqual(['2026-07-20']);
  });
});

describe('sync — docs(루틴·설정·기타찬스)', () => {
  it('키 단위 LWW로 저장·조회된다', () => {
    store.sync(ME, { cursor: 0, docs: [{ key: 'routines', value: [{ id: 'r1' }], ts: 100 }] });
    const out = store.sync(ME, { cursor: 0, docs: [{ key: 'routines', value: [{ id: 'r1' }, { id: 'r2' }], ts: 200 }] });
    expect(out.docs.find((d) => d.key === 'routines').value).toHaveLength(2);
  });

  it('서로 다른 키는 간섭하지 않는다', () => {
    store.sync(ME, { cursor: 0, docs: [{ key: 'routines', value: ['a'], ts: 100 }] });
    const out = store.sync(ME, { cursor: 0, docs: [{ key: 'settings', value: { weekStart: 1 }, ts: 50 }] });
    expect(out.docs.map((d) => d.key).sort()).toEqual(['routines', 'settings']);
  });

  it('모르는 키는 버린다', () => {
    const out = store.sync(ME, { cursor: 0, docs: [{ key: 'evil', value: 1, ts: 100 }] });
    expect(out.docs).toEqual([]);
  });
});

describe('sync — 방어', () => {
  it('형태가 깨진 항목만 건너뛰고 나머지는 반영한다', () => {
    // 한 칸이 깨졌다고 전체를 거부하면 클라이언트가 영구히 밀리지 못한다.
    const out = store.sync(ME, {
      cursor: 0,
      cells: [
        { dateKey: 123, routineId: 'r1', value: true, ts: 100 }, // dateKey 타입 오류
        { dateKey: '2026-07-20', routineId: 'r1', ts: 100, value: true }, // 정상
        { dateKey: '2026-07-21', routineId: 'r1', value: true }, // ts 없음
      ],
    });
    expect(out.cells.map((c) => c.dateKey)).toEqual(['2026-07-20']);
  });

  it('사용자별로 분리된다', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    const other = store.sync('other@example.com', { cursor: 0 });
    expect(other.cells).toEqual([]);
  });

  it('빈 요청·이상한 커서도 안전하다', () => {
    expect(store.sync(ME, {}).cells).toEqual([]);
    // 기본값 `= {}`는 undefined만 막는다 — null/비객체도 던지지 않아야 한다.
    expect(store.sync(ME, null).cells).toEqual([]);
    expect(store.sync(ME, undefined).cells).toEqual([]);
    expect(store.sync(ME, 42).cells).toEqual([]);
    expect(store.sync(ME, { cursor: -5 }).cells).toEqual([]);
    expect(store.sync(ME, { cursor: 'nope', cells: 'nope', docs: 'nope' }).cells).toEqual([]);
  });
});

describe('sync — 진 쓰기도 승자를 돌려받는다 (수렴)', () => {
  // 이전 테스트들이 충돌을 전부 cursor:0으로 확인해 이 결함을 가렸다.
  // cursor가 전진한 상태에서 지는 쓰기를 밀면, 승자가 응답에 실려야 클라이언트가 수렴한다.
  it('커서가 전진한 뒤 오래된 ts를 밀어도 서버 값이 응답에 실린다', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'winner', 100)] });

    const out = store.sync(ME, { cursor: first.cursor, cells: [cell('2026-07-20', 'r1', 'loser', 99)] });

    // 비어 있으면 클라이언트는 자기 값이 졌다는 걸 모른 채 영구히 분기한다.
    expect(find(out, '2026-07-20', 'r1')).toBeDefined();
    expect(find(out, '2026-07-20', 'r1').value).toBe('winner');
    expect(find(out, '2026-07-20', 'r1').ts).toBe(100);
  });

  it('같은 ts 재전송도 승자를 돌려받는다', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'first', 100)] });
    const out = store.sync(ME, { cursor: first.cursor, cells: [cell('2026-07-20', 'r1', 'second', 100)] });
    expect(find(out, '2026-07-20', 'r1').value).toBe('first');
  });

  it('docs도 마찬가지다', () => {
    const first = store.sync(ME, { cursor: 0, docs: [{ key: 'routines', value: ['winner'], ts: 100 }] });
    const out = store.sync(ME, { cursor: first.cursor, docs: [{ key: 'routines', value: ['loser'], ts: 50 }] });

    expect(out.docs.find((d) => d.key === 'routines')?.value).toEqual(['winner']);
  });
});

describe('sync — value 누락은 삭제가 아니다', () => {
  it('value가 없는 항목은 버린다 — 직렬화 버그가 삭제로 둔갑하지 않게', () => {
    const first = store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });

    // value 키 자체가 빠진 요청(더 최신 ts) — 예전 구현은 이걸 툼스톤으로 만들었다.
    const out = store.sync(ME, { cursor: first.cursor, cells: [{ dateKey: '2026-07-20', routineId: 'r1', ts: 200 }] });

    const full = store.sync(ME, { cursor: 0 });
    expect(find(full, '2026-07-20', 'r1').value).toBe(true); // 살아 있어야 한다
    expect(out.cells.every((c) => c.value !== null)).toBe(true);
  });

  it('명시적 null은 여전히 삭제로 인정된다', () => {
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    store.sync(ME, { cursor: 0, cells: [cell('2026-07-20', 'r1', null, 200)] });
    const full = store.sync(ME, { cursor: 0 });
    expect(find(full, '2026-07-20', 'r1').value).toBe(null);
  });
});

describe('rekeyOwner — IdP 변경 복구', () => {
  const OLD = 'sub-old';
  const NEW = 'sub-new';

  it('옛 커서를 그대로 든 클라이언트도 이관된 데이터를 받는다', () => {
    // 이게 이 기능의 존재 이유다. owner만 바꾸고 seq를 두면 재키잉된 행의 seq가
    // 옛 커서 이하라 `seq > cursor` 조회가 전부 건너뛰어 데이터가 여전히 없어 보인다.
    const before = store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)], docs: [{ key: 'routines', value: ['a'], ts: 100 }] });
    const staleCursor = before.cursor;

    expect(store.rekeyOwner(OLD, NEW)).toEqual({ cells: 1, docs: 1 });

    const after = store.sync(NEW, { cursor: staleCursor });
    expect(find(after, '2026-07-20', 'r1')?.value).toBe(true);
    expect(after.docs.find((d) => d.key === 'routines')?.value).toEqual(['a']);
  });

  it('옛 소유자에는 아무것도 남지 않는다', () => {
    store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    store.rekeyOwner(OLD, NEW);
    expect(store.sync(OLD, { cursor: 0 }).cells).toEqual([]);
  });

  it('무의미한 이관은 무시한다', () => {
    store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    expect(store.rekeyOwner(OLD, OLD)).toEqual({ cells: 0, docs: 0 });
    expect(store.rekeyOwner('', NEW)).toEqual({ cells: 0, docs: 0 });
    expect(store.sync(OLD, { cursor: 0 }).cells).toHaveLength(1); // 그대로 남아 있다
  });

  it('owners()가 소유자별 행 수를 알려준다 (어느 sub에 묶였는지 찾는 용도)', () => {
    store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100), cell('2026-07-21', 'r1', true, 100)] });
    store.sync(NEW, { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 100)] });
    expect(store.owners()).toEqual([
      { owner: OLD, cells: 2, docs: 0 },
      { owner: NEW, cells: 1, docs: 0 },
    ]);
  });

  it('docs만 있는 소유자도 찾아진다 — 루틴만 만들고 아직 체크를 안 한 경우', () => {
    // cells만 세면 이런 소유자는 복구 대상으로 발견되지 않는다.
    store.sync(OLD, { cursor: 0, docs: [{ key: 'routines', value: ['a'], ts: 100 }] });
    expect(store.owners()).toEqual([{ owner: OLD, cells: 0, docs: 1 }]);
  });

  it('양쪽에 같은 칸이 있어도 병합한다 — 옮기기만 하면 UNIQUE 제약으로 복구가 통째로 실패한다', () => {
    // 사용자는 보통 새 신원으로 앱을 좀 써본 뒤에야 데이터가 비었다는 걸 안다.
    store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'old-newer', 300), cell('2026-07-19', 'r1', 'old-only', 100)] });
    store.sync(NEW, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'new-older', 200)] });

    expect(() => store.rekeyOwner(OLD, NEW)).not.toThrow();

    const after = store.sync(NEW, { cursor: 0 });
    // 충돌한 칸은 LWW로 ts가 큰 쪽(옛 신원의 300)이 이긴다.
    expect(find(after, '2026-07-20', 'r1').value).toBe('old-newer');
    // 충돌하지 않은 칸도 함께 넘어온다.
    expect(find(after, '2026-07-19', 'r1').value).toBe('old-only');
    expect(store.sync(OLD, { cursor: 0 }).cells).toEqual([]);
  });

  it('충돌 시 새 신원 값이 더 최신이면 그쪽이 남는다', () => {
    store.sync(OLD, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'old-older', 100)] });
    store.sync(NEW, { cursor: 0, cells: [cell('2026-07-20', 'r1', 'new-newer', 500)] });

    store.rekeyOwner(OLD, NEW);
    expect(find(store.sync(NEW, { cursor: 0 }), '2026-07-20', 'r1').value).toBe('new-newer');
  });

  it('docs 충돌도 같은 규칙으로 병합된다', () => {
    store.sync(OLD, { cursor: 0, docs: [{ key: 'routines', value: ['old'], ts: 300 }] });
    store.sync(NEW, { cursor: 0, docs: [{ key: 'routines', value: ['new'], ts: 100 }] });

    expect(() => store.rekeyOwner(OLD, NEW)).not.toThrow();
    expect(store.sync(NEW, { cursor: 0 }).docs.find((d) => d.key === 'routines').value).toEqual(['old']);
  });
});

describe('sync — 응답에 owner를 담는다', () => {
  it('클라이언트가 소유자 변경을 감지해 커서를 버릴 수 있다', () => {
    const out = store.sync('sub-a', { cursor: 0, cells: [cell('2026-07-20', 'r1', true, 1)] });
    expect(out.owner).toBe('sub-a');
  });
});
