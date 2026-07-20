// 동기화 저장소 — SQLite(node:sqlite 내장, 네이티브 의존성 없음).
//
// 필요 Node: **22.13+ (단 23.x는 23.4+)**. node:sqlite는 22.5에 추가됐지만 플래그
// (`--experimental-sqlite`)가 사라진 건 22.13과 23.4다 → 22.5~22.12와 23.0~23.3에서는
// 플래그 없이 import하면 기동 중에 실패한다. 단순히 `>=22.13`으로 잡으면 23.0~23.3이
// 제약을 통과하면서도 터지므로, `server/package.json`의 engines는 두 구간을 나눠 선언한다.
// (배포 이미지는 node:24-alpine이라 실제 런타임은 이 범위 위쪽에 있다.)
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

// ts는 **안전 정수**여야 한다. isFinite만 보면 2^53 이상이 통과하는데, 그 값은 INSERT는
// 성공하고 **읽을 때** node:sqlite가 던진다("Value is too large to be represented as a
// JavaScript number") → 오염된 행이 DB에 남아 그 소유자의 이후 모든 동기화가 영구히 500이 된다.
// 요청 하나로 자기 데이터가 잠기는 셈이라, 입구에서 막는다. 소수·1e300 등도 epoch ms로 무의미하다.
const isPlainTs = (v) => Number.isSafeInteger(v) && v >= 0;

// 들어온 변경을 방어적으로 정규화한다. 형태가 어긋난 항목은 통째로 버리지 않고 건너뛴다 —
// 한 칸이 깨졌다고 나머지 동기화를 막으면 클라이언트가 영구히 밀리지 못한다.
function normalizeCells(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const c of input) {
    if (!c || typeof c !== 'object') continue;
    if (typeof c.dateKey !== 'string' || typeof c.routineId !== 'string') continue;
    if (!isPlainTs(c.ts)) continue;
    // value가 아예 없는 항목은 **버린다**. `?? null`로 뭉개면 직렬화·outbox 버그로 value가
    // 빠진 요청이 삭제로 둔갑해 다른 기기까지 지워버린다. 삭제는 명시적 null만 인정한다.
    if (c.value === undefined) continue;
    out.push({ dateKey: c.dateKey, routineId: c.routineId, value: c.value, ts: c.ts });
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

  // LWW: 값·ts는 기존보다 새로울 때만 바뀐다. 같은 ts면 유지(재전송이 순서를 뒤집지 않게).
  //
  // **seq는 져도 항상 올린다.** 갱신을 통째로 건너뛰면 그 행의 seq가 그대로라 다음
  // `seq > cursor` 조회에 안 잡히고, 커서만 전진한 클라이언트는 자기 쓰기가 졌다는 사실을
  // 영영 알지 못해 영구히 분기한다. seq를 올려두면 승자가 응답에 실려 돌아가 수렴한다.
  const putCell = db.prepare(`
    INSERT INTO cells (owner, date_key, routine_id, value, ts, seq)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner, date_key, routine_id) DO UPDATE SET
      value = CASE WHEN excluded.ts > cells.ts THEN excluded.value ELSE cells.value END,
      ts    = CASE WHEN excluded.ts > cells.ts THEN excluded.ts    ELSE cells.ts    END,
      seq   = excluded.seq
  `);
  const putDoc = db.prepare(`
    INSERT INTO docs (owner, key, value, ts, seq)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(owner, key) DO UPDATE SET
      value = CASE WHEN excluded.ts > docs.ts THEN excluded.value ELSE docs.value END,
      ts    = CASE WHEN excluded.ts > docs.ts THEN excluded.ts    ELSE docs.ts    END,
      seq   = excluded.seq
  `);
  const cellsSince = db.prepare('SELECT date_key, routine_id, value, ts, seq FROM cells WHERE owner = ? AND seq > ? ORDER BY seq');
  const docsSince = db.prepare('SELECT key, value, ts, seq FROM docs WHERE owner = ? AND seq > ? ORDER BY seq');

  return {
    // 밀어넣고(push) 그 자리에서 당겨온다(pull). 한 번의 왕복으로 끝내 중간 상태를 만들지 않는다.
    sync(owner, input) {
      // 기본값 `= {}`는 undefined만 막고 null은 못 막는다(구조분해에서 던진다).
      // 호출자(HTTP 핸들러)가 이미 검증하지만, 저장소도 스스로 온전하게 둔다.
      const { cursor = 0, cells = [], docs = [] } = input && typeof input === 'object' ? input : {};
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
      // owner를 함께 돌려준다 — 클라이언트는 소유자가 바뀌면(IdP 변경 등) 커서를 버려야 한다.
      // 옛 소유자에서 받은 커서를 그대로 쓰면 새 소유자의 행을 전부 건너뛴다.
      return { owner, cursor: nextSeq.get().next_seq - 1, cells: outCells, docs: outDocs };
    },

    // 소유자 키 이관(IdP 변경으로 sub가 바뀐 경우의 복구).
    // **seq를 새로 발급하는 것이 핵심이다.** 단순히 owner만 바꾸면 행의 seq가 옛 커서 이하로
    // 남아, 그 커서를 든 클라이언트가 조회해도 전부 건너뛰어 데이터가 여전히 없어 보인다.
    // **옮기지 않고 병합한다.** 사용자는 보통 새 신원으로 앱을 좀 써본 뒤에야 데이터가
    // 비어 보인다는 걸 알아채므로, 그 시점엔 양쪽에 같은 칸이 있기 쉽다. owner를 그대로
    // UPDATE하면 대상 PK와 충돌해 UNIQUE 제약으로 트랜잭션 전체가 롤백되고 복구가 아예 안 된다.
    // 충돌하는 칸은 기존 LWW 규칙(ts가 큰 쪽)으로 정한다.
    rekeyOwner(from, to) {
      if (!from || !to || from === to) return { cells: 0, docs: 0 };
      db.exec('BEGIN IMMEDIATE');
      try {
        let seq = nextSeq.get().next_seq;

        const srcCells = db.prepare('SELECT date_key, routine_id, value, ts FROM cells WHERE owner = ?').all(from);
        for (const r of srcCells) putCell.run(to, r.date_key, r.routine_id, r.value, r.ts, seq++);
        db.prepare('DELETE FROM cells WHERE owner = ?').run(from);

        const srcDocs = db.prepare('SELECT key, value, ts FROM docs WHERE owner = ?').all(from);
        for (const r of srcDocs) putDoc.run(to, r.key, r.value, r.ts, seq++);
        db.prepare('DELETE FROM docs WHERE owner = ?').run(from);

        bumpSeq.run(seq);
        db.exec('COMMIT');
        return { cells: srcCells.length, docs: srcDocs.length };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // 운영용: 어떤 소유자에 얼마나 쌓여 있는지.
    // **cells와 docs를 모두 센다** — 루틴·설정만 만들고 아직 체크를 안 한 소유자는
    // cells가 비어 있어서, cells만 보면 복구 대상으로 찾아지지 않는다.
    owners() {
      return db
        .prepare(
          `SELECT owner,
                  SUM(CASE WHEN src = 'c' THEN n ELSE 0 END) AS cells,
                  SUM(CASE WHEN src = 'd' THEN n ELSE 0 END) AS docs
             FROM (SELECT owner, 'c' AS src, COUNT(*) AS n FROM cells GROUP BY owner
                   UNION ALL
                   SELECT owner, 'd' AS src, COUNT(*) AS n FROM docs  GROUP BY owner)
            GROUP BY owner
            ORDER BY cells + docs DESC, owner`,
        )
        .all();
    },
  };
}
