# Routine App — Claude Code 가이드

주간 습관 트래커(루틴 체크). 탭 체크·루틴 추가/편집·캘린더·통계 UI. **최종 목표는 프로토타입이 아니라
"전체 온전한 앱"**(실제 날짜로 매일 사용·데이터 유지·PWA 설치·정시 알림·다기기 동기화되는 프로덕션 수준).

- 구현 로드맵: 에픽 이슈 **#9**, 세부 **#1~#8**. 진행 순서 1(날짜)→2(저장)→3(레이아웃)→4(PWA)→5(배포)→7(백엔드)→6(알림)→8(품질, 병행).
- 스택: Vite + React 18(단일 패키지, JS/JSX). 테스트 vitest + Testing Library(jsdom).

## 명령어

- `npm run dev` — 로컬 개발 서버(Vite)
- `npm test` — 순수 로직 + App 구동 렌더 테스트(vitest · jsdom, DB 불필요)
- `npm run build` — 프로덕션 번들

## 워크플로 (필수)

- **main 직접 커밋 금지.** feature 브랜치 → PR(`Closes #N`) → CI green → **머지는 사용자가 한다.**
- PR은 작게, 한 번에 하나(직전 PR 머지 후 다음 착수). 백로그는 GitHub 이슈로 추적(#1~#9).
- 로드맵 작업 착수 전 해당 이슈를 확인하고, PR 본문에 `Closes #N`으로 연결.
- 커밋 메시지에 `Co-Authored-By` 트레일러 유지.
- 문서(README·CLAUDE.md)가 실상태와 어긋나면 `doc-lint` 스킬로 점검(보고 전용, 자동 수정 안 함).

## 아키텍처

- **로직/뷰 분리**: `src/appLogic.js`는 순수 함수·상수(뷰 의존 없음, 테스트 대상), `src/App.jsx`는 렌더링.
  새 파생 계산은 App의 `useMemo`가 아니라 appLogic의 순수 함수로 빼고 테스트를 동봉한다.
- **'오늘'은 주입값**(#1 완료): 고정 상수 아님. `appLogic.js`가 `startOfToday()`(자정 기준 런타임
  `new Date()`)를 제공하고 `rangeStart`/`finalizedResults`/`createSeedChecks`는 `today`를 인자로 받는다.
  App이 `today`를 상태로 계산해 이들에 주입 → 테스트는 고정 날짜를 주입해 결정적으로 검증하고, 앱은 자정
  타이머·포커스/가시성 복귀 시 today를 갱신한다. **`TODAY` 고정 상수·import는 남기지 않는다.**
- **주차 판정**: 주 시작 요일(`weekStart` 0=일/1=월) 기준. 과거 `WEEKS_BACK`주 ~ 미래 `WEEKS_FWD`주 창을
  today에 앵커. "완료된 주(finalized)"는 주 마지막날 < today 인 주만(진행 중 주는 통계에서 제외).
- **상태/영속화**: **현재 인메모리 목업**(`buildInitialRoutines`/`createSeedChecks` 결정적 시드).
  localStorage 영속화·데모 시드 제거는 **#2에서** 도입 예정 — 그 전까지 새로고침 시 데이터 초기화가 정상.

## 로드맵 단계 메모

- Phase 1: ~~#1 실제 날짜~~(완료 · PR #11) · **다음 → #2** localStorage 영속화 + 데모 시드 제거
- Phase 2: #3 반응형 전체화면(목업 프레임 제거) · #4 PWA · #5 배포(정적 호스팅 + 자동 배포)
- Phase 3: #6 알림 · #7 백엔드·계정·클라우드 동기화
- 상시: #8 테스트·접근성·에러 처리·브랜딩
