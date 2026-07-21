import { describe, expect, it } from 'vitest';
import {
  applySyncResponse,
  diffState,
  emptySync,
  enqueueLocalChanges,
  parseSync,
  queueCell,
  serializeSync,
  settingsDoc,
  syncRequest,
} from './appLogic.js';

const R = [{ id: 'r1', name: '운동', iconKey: 'run', color: '#0EA5A4', goalType: 'atLeast', goalCount: 6, visible: true }];
const baseState = (over = {}) => ({
  routines: R,
  checks: {},
  bonusChances: {},
  weekStart: 0,
  notif: true,
  remindHour: 21,
  ...over,
});

describe('diffState — 변경분 추출', () => {
  it('새 체크는 cell 추가, 삭제는 value:null', () => {
    const prev = baseState();
    const added = baseState({ checks: { '2026-07-20': { r1: true } } });
    expect(diffState(prev, added).cells).toEqual([{ dateKey: '2026-07-20', routineId: 'r1', value: true }]);
    // 되돌리면 삭제(null)
    expect(diffState(added, prev).cells).toEqual([{ dateKey: '2026-07-20', routineId: 'r1', value: null }]);
  });

  it('찬스로 바뀐 값 변화도 잡는다', () => {
    const a = baseState({ checks: { '2026-07-20': { r1: true } } });
    const b = baseState({ checks: { '2026-07-20': { r1: { chance: 'weekly' } } } });
    expect(diffState(a, b).cells).toEqual([{ dateKey: '2026-07-20', routineId: 'r1', value: { chance: 'weekly' } }]);
  });

  it('변화 없으면 빈 목록', () => {
    const s = baseState({ checks: { '2026-07-20': { r1: true } } });
    expect(diffState(s, s)).toEqual({ cells: [], docs: [] });
  });

  it('routines·settings·bonusChances 변화는 doc으로', () => {
    const prev = baseState();
    const next = baseState({
      routines: [...R, { id: 'r2', name: '독서', iconKey: 'book', color: '#2563EB', goalType: 'atLeast', goalCount: 3, visible: true }],
      weekStart: 1,
      bonusChances: { r1: [{ id: 'b1', reason: '장염', createdAt: '2026-07-01T00:00:00.000Z' }] },
    });
    const { docs } = diffState(prev, next);
    const keys = docs.map((d) => d.key).sort();
    expect(keys).toEqual(['bonusChances', 'routines', 'settings']);
    expect(docs.find((d) => d.key === 'settings').value).toEqual({ weekStart: 1, notif: true, remindHour: 21 });
  });
});

describe('outbox 적재 + coalesce', () => {
  it('enqueueLocalChanges가 diff를 ts와 함께 쌓는다', () => {
    const sync = enqueueLocalChanges(emptySync(), baseState(), baseState({ checks: { '2026-07-20': { r1: true } } }), 100);
    expect(syncRequest(sync).cells).toEqual([{ dateKey: '2026-07-20', routineId: 'r1', value: true, ts: 100 }]);
  });

  it('같은 칸을 다시 적재하면 마지막 값만 남는다(coalesce)', () => {
    let sync = queueCell(emptySync(), '2026-07-20', 'r1', true, 100);
    sync = queueCell(sync, '2026-07-20', 'r1', { chance: 'weekly' }, 200);
    const cells = syncRequest(sync).cells;
    expect(cells).toHaveLength(1);
    expect(cells[0]).toEqual({ dateKey: '2026-07-20', routineId: 'r1', value: { chance: 'weekly' }, ts: 200 });
  });
});

describe('applySyncResponse — prune + pull 반영', () => {
  it('정상 왕복: 보낸 칸을 outbox에서 빼고 커서를 전진한다', () => {
    const state = baseState({ checks: { '2026-07-20': { r1: true } } });
    let sync = queueCell(emptySync(), '2026-07-20', 'r1', true, 100);
    const sent = syncRequest(sync);
    const resp = { owner: 'sub-1', cursor: 5, cells: [{ dateKey: '2026-07-20', routineId: 'r1', value: true, ts: 100 }], docs: [] };
    const out = applySyncResponse(state, sync, resp, sent);
    expect(out.sync.cells).toEqual({}); // prune됨
    expect(out.sync.cursor).toBe(5);
    expect(out.sync.owner).toBe('sub-1');
    expect(out.state.checks).toEqual({ '2026-07-20': { r1: true } });
  });

  it('비행 중 같은 칸을 또 고치면(ts 변함) prune하지 않고 로컬을 지킨다', () => {
    // 보낸 뒤 사용자가 같은 칸을 다시 편집 → outbox ts가 200으로 바뀜
    let sync = queueCell(emptySync(), '2026-07-20', 'r1', true, 100);
    const sent = syncRequest(sync); // ts 100 스냅샷
    sync = queueCell(sync, '2026-07-20', 'r1', { chance: 'weekly' }, 200);
    const localState = baseState({ checks: { '2026-07-20': { r1: { chance: 'weekly' } } } });
    // 서버는 옛 값(ts 100)을 승자로 돌려줌
    const resp = { owner: 'sub-1', cursor: 5, cells: [{ dateKey: '2026-07-20', routineId: 'r1', value: true, ts: 100 }], docs: [] };
    const out = applySyncResponse(localState, sync, resp, sent);
    // outbox에 재편집분(ts 200)이 남고, pull은 로컬을 덮지 않는다
    expect(out.sync.cells).toEqual({ '2026-07-20\tr1': { dateKey: '2026-07-20', routineId: 'r1', value: { chance: 'weekly' }, ts: 200 } });
    expect(out.state.checks).toEqual({ '2026-07-20': { r1: { chance: 'weekly' } } });
  });

  it('다른 기기가 이긴 경우: 진 로컬 쓰기는 빠지고 서버 승자가 반영된다', () => {
    let sync = queueCell(emptySync(), '2026-07-20', 'r1', true, 100);
    const sent = syncRequest(sync);
    const localState = baseState({ checks: { '2026-07-20': { r1: true } } });
    // 서버: 다른 기기가 ts 150으로 삭제(툼스톤) → 승자는 null
    const resp = { owner: 'sub-1', cursor: 7, cells: [{ dateKey: '2026-07-20', routineId: 'r1', value: null, ts: 150 }], docs: [] };
    const out = applySyncResponse(localState, sync, resp, sent);
    expect(out.sync.cells).toEqual({}); // 우리 쓰기는 prune
    expect(out.state.checks).toEqual({}); // 삭제 승자 반영
  });

  it('pull된 docs를 반영: routines를 먼저 적용해 bonusChances validIds가 최신', () => {
    const state = baseState();
    const resp = {
      owner: 'sub-1',
      cursor: 9,
      cells: [],
      docs: [
        { key: 'bonusChances', value: { r2: [{ id: 'b1', reason: '출장', createdAt: '2026-07-05T00:00:00.000Z' }] }, ts: 100 },
        { key: 'routines', value: [...R, { id: 'r2', name: '독서', iconKey: 'book', color: '#2563EB', goalType: 'atLeast', goalCount: 3, visible: true }], ts: 100 },
        { key: 'settings', value: { weekStart: 1, notif: false, remindHour: 8 }, ts: 100 },
      ],
    };
    const out = applySyncResponse(state, emptySync(), resp, { cells: [], docs: [] });
    expect(out.state.routines.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(out.state.bonusChances.r2).toHaveLength(1); // r2가 유효 id라 살아남음
    expect(settingsDoc(out.state)).toEqual({ weekStart: 1, notif: false, remindHour: 8 });
  });

  it('비행 중 편집(아직 outbox에 없던)을 응답 적용 전 반영하면 pull이 덮지 않는다 (#30 Codex P1)', () => {
    // runSync가 응답 적용 직전에 하는 일: baseline→live 편집을 먼저 outbox에 반영.
    const baseline = baseState(); // 편집 전(패시브 effect 미실행 가정)
    const live = baseState({ checks: { '2026-07-20': { r1: true } } }); // 비행 중 사용자가 체크
    const sent = { cells: [], docs: [] }; // 보낼 땐 outbox가 비어 있었다
    let sync = enqueueLocalChanges(emptySync(), baseline, live, 300); // 응답 적용 전 반영
    // 서버는 다른 기기의 X 삭제(ts 50)를 승자로 돌려주지만, 로컬 편집(ts 300)이 pending이라 우선
    const resp = { owner: 'sub-1', cursor: 4, cells: [{ dateKey: '2026-07-20', routineId: 'r1', value: null, ts: 50 }], docs: [] };
    const out = applySyncResponse(live, sync, resp, sent);
    expect(out.state.checks).toEqual({ '2026-07-20': { r1: true } }); // 편집 보존
    expect(out.sync.cells['2026-07-20\tr1'].value).toBe(true); // 다음 왕복에 밀리도록 남음
  });

  it('pull로 루틴 삭제가 오면 그 루틴의 고아 체크를 정리한다 (#30 Codex P2)', () => {
    // 로컬엔 r1·r2가 있고 둘 다 체크됨. 다른 기기가 r2를 삭제 → routines 문서에 r1만.
    const r2 = { id: 'r2', name: '독서', iconKey: 'book', color: '#2563EB', goalType: 'atLeast', goalCount: 3, visible: true };
    const state = baseState({ routines: [...R, r2], checks: { '2026-07-20': { r1: true, r2: true } } });
    const resp = { owner: 'sub-1', cursor: 6, cells: [], docs: [{ key: 'routines', value: R, ts: 200 }] };
    const out = applySyncResponse(state, emptySync(), resp, { cells: [], docs: [] });
    expect(out.state.routines.map((r) => r.id)).toEqual(['r1']);
    expect(out.state.checks).toEqual({ '2026-07-20': { r1: true } }); // r2 고아 체크 제거
  });

  it('루틴 삭제 pull 시 그 루틴의 pending cell도 outbox에서 뺀다 (#30 Codex P2)', () => {
    const r2 = { id: 'r2', name: '독서', iconKey: 'book', color: '#2563EB', goalType: 'atLeast', goalCount: 3, visible: true };
    const state = baseState({ routines: [...R, r2], checks: { '2026-07-20': { r1: true, r2: true } } });
    // r2 체크가 아직 안 밀린 채 outbox에 있음
    let sync = queueCell(emptySync(), '2026-07-20', 'r2', true, 100);
    const resp = { owner: 'sub-1', cursor: 6, cells: [], docs: [{ key: 'routines', value: R, ts: 200 }] };
    const out = applySyncResponse(state, sync, resp, { cells: [], docs: [] });
    // 남겨두면 다음 sync가 r2 cell을 되쓰고 applyCell이 고아를 복원하므로, outbox에서도 제거
    expect(out.sync.cells['2026-07-20\tr2']).toBeUndefined();
    expect(out.state.checks).toEqual({ '2026-07-20': { r1: true } });
  });

  it('아직 못 민 로컬 doc이 있으면 그 키의 pull은 무시한다(로컬 우선)', () => {
    const state = baseState({ weekStart: 1 });
    // settings를 로컬에서 바꿔 outbox에 있음(아직 안 보냄)
    const sync = { ...emptySync(), docs: { settings: { key: 'settings', value: settingsDoc(state), ts: 300 } } };
    const resp = { owner: 'sub-1', cursor: 3, cells: [], docs: [{ key: 'settings', value: { weekStart: 0, notif: true, remindHour: 21 }, ts: 100 }] };
    const out = applySyncResponse(state, sync, resp, { cells: [], docs: [] });
    expect(out.state.weekStart).toBe(1); // 서버 값으로 덮지 않음
  });
});

describe('serializeSync / parseSync 왕복', () => {
  it('맵↔배열 왕복이 보존된다', () => {
    let sync = queueCell(emptySync(), '2026-07-20', 'r1', true, 100);
    sync = { ...sync, cursor: 12, owner: 'sub-1', docs: { settings: { key: 'settings', value: { weekStart: 1, notif: true, remindHour: 21 }, ts: 200 } } };
    const back = parseSync(serializeSync(sync));
    expect(back.cursor).toBe(12);
    expect(back.owner).toBe('sub-1');
    expect(syncRequest(back).cells).toEqual([{ dateKey: '2026-07-20', routineId: 'r1', value: true, ts: 100 }]);
    expect(syncRequest(back).docs).toEqual([{ key: 'settings', value: { weekStart: 1, notif: true, remindHour: 21 }, ts: 200 }]);
  });

  it('손상/부재면 빈 동기화 상태', () => {
    expect(parseSync(null)).toEqual(emptySync());
    expect(parseSync('{bad json')).toEqual(emptySync());
    expect(parseSync('42')).toEqual(emptySync());
  });

  it('안전정수 아닌 ts·미지 doc 키·value 없는 항목은 버린다', () => {
    const raw = JSON.stringify({
      version: 1,
      cursor: -1, // → 0
      cells: [
        { dateKey: '2026-07-20', routineId: 'r1', value: true, ts: 2 ** 53 }, // 비안전정수 → 버림
        { dateKey: '2026-07-21', routineId: 'r1', ts: 100 }, // value 없음 → 버림
        { dateKey: '2026-07-22', routineId: 'r1', value: true, ts: 100 }, // 유지
      ],
      docs: [
        { key: 'unknown', value: 1, ts: 100 }, // 미지 키 → 버림
        { key: 'settings', value: { weekStart: 1 }, ts: 100 }, // 유지
      ],
    });
    const back = parseSync(raw);
    expect(back.cursor).toBe(0);
    expect(syncRequest(back).cells).toEqual([{ dateKey: '2026-07-22', routineId: 'r1', value: true, ts: 100 }]);
    expect(syncRequest(back).docs).toEqual([{ key: 'settings', value: { weekStart: 1 }, ts: 100 }]);
  });
});
