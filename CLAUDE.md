# Routine App — Claude Code 가이드

주간 습관 트래커(루틴 체크). 탭 체크·루틴 추가/편집·캘린더·통계 UI. **최종 목표는 프로토타입이 아니라
"전체 온전한 앱"**(실제 날짜로 매일 사용·데이터 유지·PWA 설치·정시 알림·다기기 동기화되는 프로덕션 수준).

- 구현 로드맵: 에픽 이슈 **#9** — 세부 이슈·진행 순서·추가 백로그는 **에픽 체크박스가 단일 원장**.
  현재 위치 요약은 아래 "로드맵 단계 메모".
- 스택: Vite + React 18(단일 패키지, JS/JSX). 테스트 vitest + Testing Library(jsdom).

## 명령어

- `npm run dev` — 로컬 개발 서버(Vite). SW는 dev에서 비활성(캐시 혼선 방지).
- `npm test` — 순수 로직 + App 구동 렌더 테스트(vitest · jsdom, DB 불필요)
- `npm run build` — 프로덕션 번들 + PWA(서비스워커 `sw.js`·`manifest.webmanifest` 생성)
- `npm run preview` — 빌드 결과 미리보기(**SW/오프라인은 빌드본에서만 동작** → PWA 검증은 여기서)

## 워크플로 (필수)

- **main 직접 커밋 금지.** feature 브랜치 → PR(`Closes #N`) → CI green → **머지는 사용자가 한다.**
- PR은 작게, 한 번에 하나(직전 PR 머지 후 다음 착수). 백로그는 GitHub 이슈로 추적(에픽 #9 · `gh issue list`).
- 로드맵 작업 착수 전 해당 이슈를 확인하고, PR 본문에 `Closes #N`으로 연결.
- 커밋 메시지에 `Co-Authored-By` 트레일러 유지.
- **doc-lint 머지 체크포인트**: PR 머지가 확인되면 **다음 이슈 착수 전에** `doc-lint` 스킬로
  문서(README·CLAUDE.md·에픽 #9)를 점검한다(보고 전용, 자동 수정 안 함 — 수정은 별도 이슈/PR).

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
  실제 저장소를 만진다. App은 초기 1회 로드 → `useEffect`로 변경 시 동기화한다. 저장 키 `routine-app:v2`
  (#16). **v1 키는 지우지 않는다** — `parseState`는 version이 다르면 null을 돌려 기본값으로 폴백하므로,
  같은 키를 덮어썼다면 이미지 롤백 시 기록이 소실된다. 키를 나눠 구버전이 v1을 계속 읽게 둔다.
  `loadState`는 v2 → 없으면 v1 순으로 읽고, `clearState`는 **두 키를 모두** 지운다(v2만 지우면
  v1 폴백이 옛 기록을 되살려 "데이터 초기화"가 무효가 된다).
  **첫 방문은 기본 루틴 `defaultRoutines()`(운동·음주 2개)로 시작**(프로토타입 데모 시드
  `buildInitialRoutines`/`createSeedChecks`/물·독서 제거됨). 새 루틴 id는 `nextRoutineId()`로
  라이브 목록에서 파생하고, 루틴 삭제 시 `purgeRoutineChecks()`로 그 체크를 함께 지운다 —
  고아 체크가 남아 재활용된 id에 옛 기록이 붙는 것을 막는다(기타찬스는 `purgeRoutineBonuses()`).
  설정의 "데이터 초기화"로 기록을 지우고 기본 상태로 되돌린다.
- **찬스**(#16 완료 · PR #23 로직 · #24 토글/배지 · #25 기타찬스): 체크가 3-상태다 —
  안함 → 했음 → 찬스(`cycleCheck`). 체크 값은
  `true`(했음) 또는 `{ chance: 'weekly'|'monthly'|'bonus', bonusId? }`(찬스).
  **잔여를 카운터로 저장하지 않고 사용 기록에서 파생한다**(`weeklyChanceLeft`/`monthlyChanceLeft`/
  `bonusChancesLeft`) — 사용이 사라지면 잔여가 저절로 복원되므로 취소·리필이 공짜이고,
  주/월 경계에 자정 타이머가 필요 없다('오늘' 주입 패턴과 동일한 이유). 소급 체크도 그 날짜가
  속한 주/월로 자연히 판정된다. 소진 순서는 주 → 월 → 기타(오래된 것부터, `pickChanceSource`).
  **집계는 goalType으로 분기**한다(`weekCount`): atLeast는 찬스를 +1로, atMost는 카운트에서 제외.
  이 분기가 없으면 줄이는 습관에서 찬스가 +1로 새어 목표를 해친다.
  `weekCount(weekStart, routine, checks)`는 routineId가 아니라 **routine 객체**를 받는다(분기 때문).
  뷰는 `checks`를 직접 판정하지 않는다 — 상태 조회는 `checkState()`, 보유는 `chanceSummary()`,
  기타찬스 목록은 `bonusChanceRows()`를 쓴다(`Boolean(checks[k]?.[id])`로 보면 찬스가 '했음'과
  구분되지 않는다). 찬스는 앰버 `--color-chance`지만 **색만으로 구분하지 않는다** — 글리프도
  ✓/★로 다르다(색각 이상·흑백 대비). 기타찬스는 사유 필수이고, **이미 쓴 것은 삭제하지 않는다**
  (지우면 그 날 찬스 체크가 참조를 잃는다 → 목록에서 '사용함'으로 표시).
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
  glob이 `png/svg/ico`까지 매칭하면 **URL 중복**이 생겨 SW install이 깨진다(오프라인/설치 실패).
  매니페스트는 `standalone`·`theme_color` `#0B1220`. 아이콘은 `public/`의 브랜드 틸 체크
  (192/512/maskable/apple-touch/favicon) — 소스는 `public/logo.svg`, 재생성은
  `npx @vite-pwa/assets-generator --preset minimal-2023 public/logo.svg` 후 maskable은
  풀블리드가 되도록 `pwa-512x512.png`로 덮어쓴다. SW 등록은 플러그인이 자동 주입.
- **배포**(#5): Docker 이미지(nginx가 `dist/` 서빙 — PWA 캐시 규칙은 `deploy/nginx.conf`:
  sw/index/manifest no-cache · `/assets` 불변). main 머지 시 `.github/workflows/deploy.yml`이
  이미지 빌드(**multi-arch** — 서버가 Oracle Ampere aarch64)→컨테이너 스모크→GHCR publish(private)
  →**CI가 서버로 SSH 배포**: 1회용 GITHUB_TOKEN으로 pull 후 즉시 logout(서버에 영구 자격증명 없음,
  시크릿 `DEPLOY_HOST/USER/SSH_KEY/KNOWN_HOSTS` — 호스트 키는 핀닝, keyscan 안 씀).
  PR에선 빌드+스모크만. 외부 노출은 Cloudflare Tunnel
  (`routine.chillingdaisy.org` → `localhost:8080`, 공인 포트 개방 없음). 서버 절차 `deploy/README.md`.
  2026-07-20 자동배포 경로 전 구간 실측 검증(런 약 73초 = publish 55초 + SSH 배포 9초).
- **레포는 public**(2026-07-20 전환): org 무료 Actions 분(2,000분·**org 전체 공용 풀**)이 소진돼
  모든 런이 시작 전 거부되던 것을 해소하기 위해서다 — public 레포는 Actions 무제한 무료.
  **GHCR 패키지는 여전히 private**이며 배포는 1회용 토큰 pull로 동작한다(레포 공개와 무관).
  배포 시크릿은 레포가 아니라 Actions secrets에 있고, fork PR은 시크릿을 받지 못하며 deploy 잡은
  `github.ref == 'refs/heads/main'` 게이팅이라 외부 PR로는 배포 경로에 도달할 수 없다.
  주의: 앞으로 커밋에 서버 IP·키를 넣으면 즉시 공개된다(현재 히스토리는 클린).

- **백엔드/동기화**(#7 · 진행 중): 단독 사용자 전제. `server/`가 **의존성 0개** Node API다
  (내장 모듈만 — native 모듈을 쓰면 `node_modules`가 타깃 아키텍처로 빌드돼야 해서 arm64 이미지에서
  QEMU `npm install`이 되살아난다. 프론트의 `BUILDPLATFORM` 트릭은 native엔 안 통한다).
  **인증은 직접 구현하지 않는다** — Cloudflare Access가 `routine.chillingdaisy.org/api` 경로에
  붙고, API는 엣지가 넣는 JWT만 검증한다(`server/src/access.js`, alg를 RS256으로 고정해 alg 혼동
  차단 · aud/iss 확인으로 타 앱·타 팀 토큰 차단). **fail-closed**: `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`가
  없으면 기동하지 않는다(설정 누락이 무인증 공개가 되지 않도록). compose에선 `profiles: ["api"]`로
  기본 비활성 — Access 설정 전에 켜지면 크래시 루프가 된다. 켜는 절차는 `deploy/README.md`.
  - **nginx `/api/` 프록시는 upstream을 변수로 지정**하고 `resolver`를 둔다. 리터럴로 쓰면 nginx가
    기동 시 이름을 해석하고 API 컨테이너가 없을 때 **nginx가 안 떠서 프론트까지 내려간다.**
  - Workbox `navigateFallbackDenylist`에 `/api/`를 넣는다 — 없으면 동기화 요청이 앱 셸(index.html)로
    폴백돼 클라이언트가 HTML을 JSON으로 파싱하려 든다.
  - 동기화 모델은 **셀 단위 merge**(전체 문서 LWW 아님) + 클라이언트 outbox. 근거·분할은 이슈 #7 코멘트.
  - **저장소**(`server/src/store.js`, SQLite `node:sqlite`): `cells`는 (날짜, 루틴) 한 칸이 한 행이라
    서로 다른 칸은 두 기기가 각각 고쳐도 둘 다 살아남고, 같은 칸만 `ts` LWW로 겨룬다.
    `docs`는 루틴·설정·기타찬스처럼 통째 다루는 것들(키 단위 LWW). 삭제는 값 `null` **툼스톤**으로
    남긴다 — 행을 지우면 다른 기기가 되살린다. **`ts`는 클라이언트 시각이지만 커서는 서버 `seq`**다:
    클라이언트 시계로 커서를 만들면 시계가 뒤로 가는 순간 변경을 영구히 놓친다.
  - `node:sqlite`는 **접두사 없이는 존재하지 않는 빌트인**이라 번들러가 `node:`를 떼고 해석하다
    실패한다(vitest가 Vite를 거치므로 테스트에서 터진다) → `createRequire`로 런타임 로드한다.
  - `POST /api/sync`가 push·pull을 한 왕복으로 처리한다(둘로 나누면 중간 상태가 생긴다).
    소유자는 본문이 아니라 **검증된 신원**에서 가져온다. 본문 상한 2MB이고, 초과 시
    응답을 보낸 **뒤에** 연결을 끊는다(먼저 끊으면 413이 전달되지 않는다).

## 로드맵 단계 메모

- Phase 1: ~~#1 실제 날짜~~(완료 · PR #11) · ~~#2 localStorage 영속화 + 데모 시드 제거~~(완료 · PR #13)
- Phase 2: ~~#3 반응형 전체화면(목업 프레임 제거)~~(완료) · ~~#4 PWA~~(완료) · ~~#5 배포~~(완료 —
  서버 세팅·터널까지 끝났고 2026-07-20 CI 자동배포 경로를 실측 검증했다. 절차·롤백은 `deploy/README.md`)
- 백로그: ~~#16 루틴별 찬스 시스템~~(완료 · PR #23 로직 · #24 토글/배지 · #25 기타찬스) —
  저장 스키마 v2가 확정됐으므로 #7 동기화 설계는 이 스키마 위에서 한다
- 운영 후속 **#20**(열림): CI 최적화는 PR #21로 반영됐고, 머지된 원격 브랜치 정리·
  `relay.chillingdaisy.org` DNS 등 소소한 항목이 남아 있다
- Phase 3: **다음 → #7** 백엔드·계정·클라우드 동기화 · #6 알림
- 상시: #8 테스트·접근성·에러 처리·브랜딩
