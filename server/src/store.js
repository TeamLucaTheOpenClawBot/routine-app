// 동기화 저장소 — SQLite(node:sqlite 내장, 네이티브 의존성 없음).
//
// 모델(#7 설계): 전체 문서 LWW가 아니라 **셀 단위 merge**다.
//  - cells: (날짜, 루틴) 한 칸이 한 행. 서로 다른 칸을 두 기기가 각각 고치면 둘 다 살아남고,
//    같은 칸이 충돌할 때만 ts가 큰 쪽이 이긴다.
//  - docs: 루틴 목록·설정·기타찬스처럼 통째로 다루는 것들. 키 단위 LWW.
//
// ts는 **클라이언트 논리 시각**이라 기기 시계가 틀어지면 LWW 판정도 틀어진다. 단독 사용자
// 전제에서 감수하는 트레이드오프다(기기 간 동시 편집이 드물다). 반면 **커서는 서버 seq**를
// 쓴다 — 클라이언트 시계로 커서를 만들면 시계가 뒤로 가는 순간 변경을 영구히 놓친다.

// `import { DatabaseSync } from 'node:sqlite'`로 쓰지 않는 이유:
// node:sqlite는 **접두사 없이는 존재하지 않는** 빌트인이라, 번들러가 `node:`를 떼고
// `sqlite`를 해석하려다 실패한다(vitest가 Vite를 거치므로 테스트에서 터진다).
// createRequire로 런타임에 가져오면 정적 분석 대상이 아니어서 양쪽 모두 정상 동작한다.
// 프로덕션은 Vite를 거치지 않으므로 어느 쪽이든 동작하지만, 표기를 하나로 통일한다.
import { createRequire } from 'node:module';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS cells (
  owner      TEXT    NOT NULL,
  date_key   TEXT    NOT NULL,
  routine_id TEXT    NOT NULL,
  value      TEXT,                 -- JSON. NULL이면 삭제(툼스톤 — 삭제도 전파돼야 한다)
  ts         INTEGER NOT NULL,     -- 클라이언트 논리 시각(LWW 판정)
  seq        INTEGER NOT NULL,     -- 서버 단조 증가(커서)
  PRIMARY KEY (owner, date_key, routine_id)
);
CREATE INDEX IF NOT EXISTS cells_by_seq ON cells (owner, seq);

CREATE TABLE IF NOT EXISTS docs (
  owner TEXT    NOT NULL,
  key   TEXT    NOT NULL,          -- 'routines' | 'settings' | 'bonusChances'
  value TEXT    NOT NULL,          -- JSON
  ts    INTEGER NOT NULL,
  seq   INTEGER NOT NULL,
  PRIMARY KEY (owner, key)
);
CREATE INDEX IF NOT EXISTS docs_by_seq ON docs (owner, seq);

CREATE TABLE IF NOT EXISTS meta (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  next_seq INTEGER NOT NULL
);
INSERT OR IGNORE INTO meta (id, next_seq) VALUES (1, 1);
`;

export const DOC_KEYS = new Set(['routines', 'settings', 'bonusChances']);

export function openDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  // 여러 기기가 동시에 붙어도 읽기가 쓰기에 막히지 않게. 파일 DB에서만 의미가 있다.
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

const isPlainTs = (v) => Number.isFinite(v) && v >= 0;

// 들어온 변경을 방어적으로 정규화한다. 형태가 어긋난 항목은 통째로 버리지 않고 건너뛴다 —
// 한 칸이 깨졌다고 나머지 동기화를 막으면 클라이언트가 영구히 밀리지 못한다.
function normalizeCells(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const c of input) {
    if (!c || typeof c !== 'object') continue;
    if (typeof c.dateKey !== 'string' || typeof c.routineId !== 'string') continue;
    if (!isPlainTs(c.ts)) continue;
    // value === null은 삭제를 뜻하므로 유효하다.
    out.push({ dateKey: c.dateKey, routineId: c.routineId, value: c.value ?? null, ts: c.ts });
  }
  return out;
}

function normalizeDocs(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const d of input) {
    if (!d || typeof d !== 'object') continue;
    if (!DOC_KEYS.has(d.key) || !isPlainTs(d.ts)) continue;
    if (d.value === undefined) continue;
    out.push({ key: d.key, value: d.value, ts: d.ts });
  }
  return out;
}

export function createStore(db) {
  const nextSeq = db.prepare('SELECT next_seq FROM meta WHERE id = 1');
  const bumpSeq = db.prepare('UPDATE meta SET next_seq = ? WHERE id = 1');

  // LWW: 기존 ts보다 큰 경우에만 덮어쓴다. 같은 ts면 유지(재전송이 순서를 뒤집지 않게).
  const putCell = db.prepare(`
    INSERT INTO cells (owner, date_key, routine_id, value, ts, seq)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, date_key, routine_id) DO UPDATE SET
      value = excluded.value, ts = excluded.ts, seq = excluded.seq
    WHERE excluded.ts > cells.ts
  `);
  const putDoc = db.prepare(`
    INSERT INTO docs (owner, key, value, ts, seq)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner, key) DO UPDATE SET
      value = excluded.value, ts = excluded.ts, seq = excluded.seq
    WHERE excluded.ts > docs.ts
  `);
  const cellsSince = db.prepare('SELECT date_key, routine_id, value, ts, seq FROM cells WHERE owner = ? AND seq > ? ORDER BY seq');
  const docsSince = db.prepare('SELECT key, value, ts, seq FROM docs WHERE owner = ? AND seq > ? ORDER BY seq');

  return {
    // 밀어넣고(push) 그 자리에서 당겨온다(pull). 한 번의 왕복으로 끝내 중간 상태를 만들지 않는다.
    sync(owner, { cursor = 0, cells = [], docs = [] } = {}) {
      const from = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
      const inCells = normalizeCells(cells);
      const inDocs = normalizeDocs(docs);

      db.exec('BEGIN IMMEDIATE');
      try {
        let seq = nextSeq.get().next_seq;
        for (const c of inCells) {
          putCell.run(owner, c.dateKey, c.routineId, c.value === null ? null : JSON.stringify(c.value), c.ts, seq);
          seq += 1;
        }
        for (const d of inDocs) {
          putDoc.run(owner, d.key, JSON.stringify(d.value), d.ts, seq);
          seq += 1;
        }
        bumpSeq.run(seq);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      // 커서 이후의 모든 변경을 돌려준다. 방금 밀어넣은 것도 포함되지만 적용이 멱등이라 무해하고,
      // 클라이언트가 '서버가 실제로 무엇을 채택했는지'(LWW에서 진 경우 포함) 확인할 수 있다.
      const outCells = cellsSince.all(owner, from).map((r) => ({
        dateKey: r.date_key,
        routineId: r.routine_id,
        value: r.value === null ? null : JSON.parse(r.value),
        ts: r.ts,
      }));
      const outDocs = docsSince.all(owner, from).map((r) => ({ key: r.key, value: JSON.parse(r.value), ts: r.ts }));

      // 새 커서 = 지금까지 발급된 최대 seq. 위 조회는 seq > from 전부를 담았으므로 이 값까지 안전하다.
      return { cursor: nextSeq.get().next_seq - 1, cells: outCells, docs: outDocs };
    },
  };
}
