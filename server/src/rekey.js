// 소유자 키 이관 CLI — IdP를 바꿔 Access의 sub가 달라졌을 때의 복구용.
//
//   docker exec routine-app-api node src/rekey.js            # 소유자별 행 수 확인
//   docker exec routine-app-api node src/rekey.js <옛sub> <새sub>
//
// 손으로 쓴 SQL을 문서에 두지 않고 코드로 두는 이유: 재키잉은 owner만 바꿔선 안 되고
// **seq를 새로 발급**해야 한다(안 그러면 옛 커서를 든 클라이언트가 전부 건너뛴다).
// 그 규칙을 문서 대신 테스트가 지키게 한다.

import { createStore, openDatabase } from './store.js';

const [from, to] = process.argv.slice(2);
const store = createStore(openDatabase(process.env.DB_PATH ?? '/data/routine.db'));

if (!from) {
  const rows = store.owners();
  if (!rows.length) console.log('저장된 데이터가 없습니다.');
  else for (const r of rows) console.log(`${r.owner}\tcells ${r.cells} · docs ${r.docs}`);
  console.log('\n이관: node src/rekey.js <옛sub> <새sub>');
  console.log('현재 로그인의 sub는 /api/me 로 확인합니다.');
  process.exit(0);
}

if (!to) {
  console.error('사용법: node src/rekey.js <옛sub> <새sub>');
  process.exit(1);
}

const moved = store.rekeyOwner(from, to);
console.log(`이관 완료: cells ${moved.cells}개, docs ${moved.docs}개 → ${to}`);
console.log('클라이언트는 다음 동기화에서 전체를 다시 받습니다.');
