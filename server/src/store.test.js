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
    expect(store.sync(ME, { cursor: -5 }).cells).toEqual([]);
    expect(store.sync(ME, { cursor: 'nope', cells: 'nope', docs: 'nope' }).cells).toEqual([]);
  });
});
