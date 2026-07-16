# Routine App — Claude Code 가이드

주간 습관 트래커(루틴 체크). 탭 체크·루틴 추가/편집·캘린더·통계 UI. **최종 목표는 프로토타입이 아니라
"전체 온전한 앱"**(실제 날짜로 매일 사용·데이터 유지·PWA 설치·정시 알림·다기기 동기화되는 프로덕션 수준).

- 구현 로드맵: 에픽 이슈 **#9**, 세부 **#1~#8**. 진행 순서 1(날짜)→2(저장)→3(레이아웃)→4(PWA)→5(배포)→7(백엔드)→6(알림)→8(품질, 병행).
- 스택: Vite + React 18(단일 패키지, JS/JSX). 테스트 vitest + Testing Library(jsdom).

## 명령어

- `npm run dev` — 로컬 개발 서버(Vite). SW는 dev에서 비활성(캐시 혼선 방지).
- `npm test` — 순수 로직 + App 구동 렌더 테스트(vitest · jsdom, DB 불필요)
- `npm run build` — 프로덕션 번들 + PWA(서비스워커 `sw.js`·`manifest.webmanifest` 생성)
- `npm run preview` — 빌드 결과 미리보기(**SW/오프라인은 빌드본에서만 동작** → PWA 검증은 여기서)

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
  `new Date()`)를 제공하고 `rangeStart`/`finalizedResults` 등은 `today`를 인자로 받는다.
  App이 `today`를 상태로 계산해 이들에 주입 → 테스트는 고정 날짜를 주입해 결정적으로 검증하고, 앱은 자정
  타이머·포커스/가시성 복귀 시 today를 갱신한다. **`TODAY` 고정 상수·import는 남기지 않는다.**
- **주차 판정**: 주 시작 요일(`weekStart` 0=일/1=월) 기준. 과거 `WEEKS_BACK`주 ~ 미래 `WEEKS_FWD`주 창을
  today에 앵커. "완료된 주(finalized)"는 주 마지막날 < today 인 주만(진행 중 주는 통계에서 제외).
- **상태/영속화**(#2 완료): `localStorage`에 영속화한다. `appLogic.js`의 순수 함수
  `serializeState`/`parseState`(스키마 `version` 필드 + 손상·구버전 방어)로 직렬화/검증하고,
  얇은 래퍼 `loadState`/`saveState`/`clearState`(SSR·프라이빗 모드 방어, storage 주입 가능)가
  실제 저장소를 만진다. App은 초기 1회 로드 → `useEffect`로 변경 시 동기화한다. 저장 키 `routine-app:v1`.
  **첫 방문은 기본 루틴 `defaultRoutines()`(운동·음주 2개)로 시작**(프로토타입 데모 시드
  `buildInitialRoutines`/`createSeedChecks`/물·독서 제거됨). 새 루틴 id는 `nextRoutineId()`로
  라이브 목록에서 파생하고, 루틴 삭제 시 `purgeRoutineChecks()`로 그 체크를 함께 지운다 —
  고아 체크가 남아 재활용된 id에 옛 기록이 붙는 것을 막는다. 설정의 "데이터 초기화"로 기록을
  지우고 기본 상태로 되돌린다.
- **레이아웃**(#3 완료): 목업 폰 프레임·가짜 상태바 제거. 앱 셸은 `100dvh` 세로 flex 컬럼으로
  뷰포트를 채우고 데스크톱에선 `max-width: 480px` 중앙 정렬(바깥은 `#070b14` 캔버스). `index.html`은
  `viewport-fit=cover`. 스크롤 컨테이너는 `flex:1;min-height:0`(flex 스크롤), 캘린더 요일 헤더는
  그 안에서 `sticky top:0`.
  - **safe-area 주의**: 셸 `padding-top/left/right`(env(safe-area-inset-*))는 **일반 흐름 콘텐츠**만
    보호하고, 탭바 `padding-bottom`은 홈 인디케이터 인셋을 흡수한다. 단 `position:absolute; inset:0`
    오버레이(루틴 폼·바텀시트)는 컨테이닝 블록이 셸의 **padding-box(테두리 없음 → 뷰포트 가장자리)**라
    셸 padding을 벗어난다 → 이런 오버레이는 **각자** safe-area 인셋을 직접 padding으로 가져야 노치/홈바에
    가리지 않는다.
- **PWA**(#4 완료): `vite-plugin-pwa`(`registerType: autoUpdate`, Workbox `generateSW`)로 빌드 시
  서비스워커·매니페스트를 생성. 앱 셸을 precache하고 `navigateFallback: index.html`로
  오프라인에서도 로드된다(백엔드 없는 SPA라 이걸로 완전 오프라인). **주의**: Workbox `globPatterns`는
  앱 셸(`js/css/html`)로 한정 — 아이콘/favicon은 매니페스트·`includeAssets`가 이미 precache에 넣으므로,
  glob이 `png/svg/ico`까지 매칭하면 **URL 중복**이 생겨 SW install이 깨진다(오프라인/설치 실패). 매니페스트는 `standalone`·`theme_color`
  `#0B1220`. 아이콘은 `public/`의 브랜드 틸 체크(192/512/maskable/apple-touch/favicon) — 소스는
  `public/logo.svg`, 재생성은 `npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.svg`
  후 maskable은 풀블리드가 되도록 `pwa-512x512.png`로 덮어쓴다. SW 등록은 플러그인이 자동 주입.

## 로드맵 단계 메모

- Phase 1: ~~#1 실제 날짜~~(완료 · PR #11) · ~~#2 localStorage 영속화 + 데모 시드 제거~~(완료 · PR #13)
- Phase 2: ~~#3 반응형 전체화면(목업 프레임 제거)~~(완료) · ~~#4 PWA~~(완료) · **다음 → #5** 배포(정적 호스팅 + 자동 배포)
- Phase 3: #6 알림 · #7 백엔드·계정·클라우드 동기화
- 상시: #8 테스트·접근성·에러 처리·브랜딩
