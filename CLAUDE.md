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

- **백엔드/동기화**(#7 완료 · PR #27·#28·#30·#32): 단독 사용자 전제. `server/`는 **native 의존성 0** Node API다
  (#6 2a로 순수 JS dep `web-push` 하나만 추가됨 — 핵심은 개수가 아니라 **native 금지**다: native 모듈을 쓰면
  `node_modules`가 타깃 아키텍처로 빌드돼야 해서 arm64 이미지에서
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
  - **CI의 Node 버전은 API 이미지(`node:24-alpine`)와 맞춰 둔다**(`.github/workflows/ci.yml`).
    낮으면 `node:sqlite`(실요구 하한 22.13 — `engines` 참조) 같은 차이가 로컬·컨테이너에선 멀쩡한데 CI에서만 깨지거나,
    반대로 CI를 통과하고 배포에서 터진다. 서버 요구사항은 `server/package.json`의 `engines`.
  - `POST /api/sync`가 push·pull을 한 왕복으로 처리한다(둘로 나누면 중간 상태가 생긴다).
    소유자는 본문이 아니라 **검증된 신원**에서 가져온다. 본문 상한 2MB이고, 초과 시
    응답을 보낸 **뒤에** 연결을 끊는다(먼저 끊으면 413이 전달되지 않는다).
  - **클라이언트**(#7 3/4 · PR #30): 순수 로직은 `appLogic.js`(테스트 `sync.test.js`), HTTP
    왕복만 `syncClient.js`(`postSync` — 응답을 auth/offline/toolarge/server로 분류. Access 세션
    만료는 401뿐 아니라 **HTML 200 리다이렉트**로도 오므로 content-type이 JSON이 아니면 auth로
    본다). 동기화 상태(cursor·outbox)는 유저 데이터와 **별도 키 `routine-app:sync`**에 둔다 —
    유저 문서 스키마 v2를 안 건드려, 동기화 없던 이미지로 롤백해도 구버전 앱이 이 키를 모른 채
    데이터를 그대로 읽는다(STORAGE_KEY 롤백 원칙과 동일). **outbox 적재는 편집 지점마다가 아니라
    한 곳에서** `diffState(baseline→현재)`로 뽑아 쌓는다(맵이라 같은 칸 재편집은 coalesce). App은
    baseline ref로 '반영된 상태'를 들고, pull 적용 시 baseline을 함께 올려 pull분이 로컬 편집으로
    **재적재되지 않게** 한다. prune·pull은 응답 적용 시점의 **현재** outbox 기준이라 비행 중 편집을
    잃지 않는다(진 로컬 쓰기는 prune으로 빠지고 서버 승자가 pull로 들어와 수렴). 트리거는 마운트·
    online·focus·visibility·30s 인터벌 + 편집 후 1.2s 디바운스. **신원 확인과 push는 한 요청으로
    원자화**한다 — `syncRequest`가 outbox 소유자를 `expectedOwner`로 실어 보내고, 서버가 세션 소유자와
    다르면 **쓰기 전에 409**로 거부한다(`server/src/index.js`). 확인·쓰기를 나누면(예: 별도 `GET /api/me`)
    그 사이 다른 탭 재인증으로 세션이 바뀔 때(쿠키 공유, 이 탭 리로드 없이) 남의 계정에 쓰는 TOCTOU가
    남기 때문이다. **3/4는 계정 전환을 처리하지 않는다** — 409면 아무것도 건드리지 않고(outbox·커서·
    화면 상태·baseline 그대로) 이 세션 동기화를 **멈춘다**. outbox만 비우면 화면에 남은 A 데이터가 다음
    편집 때 B 소유자로 push돼 섞이므로, 로컬 격리(wipe+reload) 없이 부분 처리하지 않고 통째로 중단한다.
    로컬(A) 데이터는 보존되고 세션이 원래 계정으로 돌아온 뒤 리로드하면 재개된다. **계정 전환 로컬
    격리·재바인딩은 #7 4/4**(단일 사용자 정상 흐름에선 409가 안 난다). **3/4는 이미 바인딩된 소유자만
    동기화한다**(`if (!owner) return`) — owner=null인 미바인딩 로컬 데이터를 자동으로 밀면 그게 지금 세션
    것인지 확인할 방법이 없고("마운트 전 데이터 없음"조차 생성 직후 다른 탭 세션 변경을 배제 못 한다),
    첫 push엔 넣을 owner가 없어 서버 409 가드도 못 건다. 따라서 **최초 로컬→클라우드 바인딩·마이그레이션은
    통째로 4/4**(getMe로 신원 확정 후 업로드/새로 시작을 사용자가 선택)로 넘긴다 — 즉 3/4는 sync
    **엔진**(outbox·병합·LWW·push/pull, 전량 단위테스트)을 싣되, 4/4가 owner를 붙여야 활성화된다.
    ts는 `nextTs`가
    `max(Date.now(), lastTs+1)`로 **단조 증가** 발급하되 **안전정수 상한을 넘지 않고**(넘으면 서버가
    드롭해 편집이 화면엔 남고 영속 안 됨), pull로 본 최대 ts까지 끌어올린다 — 기기 시계가 뒤로 가도
    새 편집이 LWW에서 조용히 지지 않게. **데이터 초기화는 outbox만 비우고
    커서는 지킨다** — 커서를 0으로 되돌리면 다음 동기화가 서버의 옛 기록을 전부 되당겨와 초기화가
    무효가 된다(교차 기기 초기화 의미론은 4/4).
  - **활성화·마이그레이션·상태 UI**(#7 4/4 · PR #32): 설정 "클라우드 동기화" 섹션에서 사용자가 켠다.
    `enableSync`가 `getMe`로 세션 sub를 확정해 owner를 붙여 엔진을 켠다 — 이후 push는 그 owner를
    expectedOwner로 실어 409로 보호되므로(3/4) getMe·쓰기 사이 세션이 바뀌어도 안전하다. 최초 시작은
    **사용자가 선택**한다: **① 이 기기 데이터로**(`enqueueAll`로 전체 업로드 — 문서는 whole-doc LWW라
    지금 ts로 이 기기가 이긴다) · **② 클라우드 데이터로**(로컬을 기본값으로 비우고 커서 0에서 새로 당김,
    확인 필수). 이 선택이 있어야 whole-doc LWW가 상대 기기 문서를 조용히 덮지 않는다. `disableSync`는
    owner를 떼고 outbox·커서를 버려(다른 계정 재연결 시 새는 것 방지) 동기화를 끈다(로컬 데이터는 보존).
    상태(`syncStatus`)는 off·syncing·synced·offline·reauth·mismatch·error로 설정 화면에 표시된다.

- **알림**(#6 · 1단계 PR #34): 설정 토글 ON 시 `Notification.requestPermission()`으로 권한을 받고
  (`notifPerm`), granted면 **앱이 열려 있는 동안** 다음 `remindHour`:00에 알림을 띄운다(미완료가 있을 때만).
  **실제 켜짐은 `notif && notifPerm==='granted'`**(`remindersOn`)로 판정한다 — notif 기본값이 true여도
  권한이 없으면 토글을 꺼짐으로 보여, "켜짐인데 안 뜨는" 모순과 두 번 눌러야 권한 요청되는 문제를 없앤다.
  예약 시각은 순수 함수 `nextReminderAt(now, remindHour)`(자정 넘김·정각 중복발화 방지, 테스트 대상)로
  구하고, App이 `setTimeout`으로 예약→발화→다음날 재예약한다(deps는 notif·notifPerm·remindHour뿐이라
  체크할 때마다 재예약되지 않는다). 미완료 수는 **발화 시점에 `startOfToday()` fresh 날짜로 직접** 센다 —
  `today` 상태는 자정 후 500ms에 갱신되므로 remindHour=0(자정) 발화가 그보다 빨라 전날 수로 알릴 수 있다.
  또 예약 `target` 시각을 보존해 **동결됐던 탭이 뒤늦게 깨어 콜백이 예약 시각을 5분 넘겨 실행되면 발화를
  건너뛴다**(전날 알림이 다음 날 아침에 뜨고 그날 또 뜨는 이중 발화 방지). 알림은 SW `registration.showNotification`(설치 PWA), 없으면
  `new Notification()`으로. `remindHour`는 설정의 시각 셀렉트로 편집(0~23), notif/remindHour는 기존대로
  영속·동기화된다. **1단계 한계**: 탭이 살아 있어야 동작한다 → 잠금 화면 알림은 2단계 서버 푸시로.
- **알림 2단계 — 서버 Web Push**(#6 · 2a PR #35): 앱이 꺼져 있어도 서버가 보낸다. **web-push**(순수 JS,
  native 아님 → QEMU 무관)를 서버의 **유일한 dep**로 쓰되 **런타임 전용 `push-send.js`에 격리**한다 —
  루트 vitest·CI가 web-push 설치 없이도 그린이도록(구독 저장 `push-store.js`는 순수·테스트 대상). VAPID 키는
  compose env(`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`), **없으면 푸시 비활성**(구독 저장은 되고 발송만 안 됨,
  fail-safe — 크래시 아님). 절차는 `deploy/README.md`. 엔드포인트 `GET /api/push/key`·`POST
  /api/push/{subscribe,unsubscribe,test}`(소유자는 sync와 같은 검증된 `sub`). 구독은 (owner, endpoint) PK로
  멱등, 410/404 응답이면 `removeEndpoint`로 만료 정리. **endpoint는 알려진 푸시 서비스 호스트(https)로만
  허용**(`isAllowedPushEndpoint` — fcm.googleapis.com·push.services.mozilla.com·notify.windows.com·push.apple.com):
  발송 시 서버가 endpoint로 아웃바운드하므로 임의 endpoint를 저장하면 인증 사용자가 내부 주소로 SSRF를
  만들 수 있다. SW 핸들러(`public/push-sw.js` — push/notificationclick)는
  generateSW를 injectManifest로 바꾸지 않고 `workbox.importScripts`로 얹는다(PWA 셸 불변). 클라이언트
  `pushClient.js`가 `/api/push/key`로 공개키를 받아 `pushManager.subscribe` 후 서버 등록 — 설정 "잠금 화면
  알림"에서 켠다(동기화 연결+권한 전제). **연결 해제(`disableSync`)는 `unsubscribePush`로 서버 행·브라우저
  구독까지 지운다**(안 하면 다른 기기 발송이 계속 오고 해제 UI도 사라진다). **재키잉도 push_subs를 함께
  이관**한다(`rekey.js`가 `pushStore.rekeyOwner` 호출 — 안 하면 sub 변경 후 푸시를 못 받는다).
- **알림 2b — 매일 정시 크론**(#6 · PR #37): API 프로세스 **in-process `setInterval`(1분)**이 모든 구독을
  훑어 정시 발송한다(`cron.js`). 판정은 순수 `reminders.js`(테스트 대상): `localDateParts(now, tz)`(Intl로
  DST 반영), `incompleteToday(routines, checkedIds)`(클라 remainingToday 서버판), `shouldRemind`(알림 켜짐·
  로컬 시=remindHour·**정각 창(첫 `REMIND_WINDOW_MIN`=5분)**·오늘 미발송·미완료>0). 정각 창이 없으면 크론
  틱 위상(프로세스 기동 시각)에 따라 그 시간대 아무 때나 늦게 보낸다(예: :30 재기동 즉시틱) — 클라
  `nextReminderAt`이 :00에 예약하는 것과 맞춘다. **타임존은 구독에 IANA 문자열로 저장**한다(클라가 subscribe 때
  동봉 — offset보다 DST에 견고) — remindHour는 사용자값(settings doc)이지만 로컬 시각은 기기 tz라, 발송
  타이밍은 구독 단위로 계산한다. `last_sent`(로컬 날짜)로 **하루 1회** 보장(같은 날 재틱은 skip). 미완료는
  `store.getDoc('routines')` + `store.checkedRoutineIds(owner, dateKey)`(non-null 셀)로 서버가 직접 센다.
  발송기(VAPID) 없으면 tick은 no-op. `push_subs`에 `tz`·`last_sent` 컬럼 추가(기존 DB는 idempotent ALTER 마이그레이션).
  틱은 **직렬화**한다(in-flight 가드 — 느린 발송이 다음 분 틱과 겹쳐 이중 발송되는 것 방지) 하고, **start()가
  기동 즉시 1회** 돈다(인터벌 첫 틱을 기다리다 그 시간대를 놓치지 않게). tz는 subscribe 때만 잡히므로,
  구독이 있으면 **앱 시작 시 `refreshTimezone`으로 최신 tz를 재등록**한다(기기 이동/시스템 tz 변경 반영).
  **tz 미상 구독(2a 이전은 마이그레이션으로 NULL)은 크론이 스킵**한다 — UTC로 추측하면 서울 사용자가
  21:00 대신 06:00에 받으므로, 재등록(refreshTimezone)으로 tz가 채워질 때까지 보내지 않는다.

- **에러 처리**(#8): `src/ErrorBoundary.jsx`(클래스 컴포넌트)가 `main.jsx`에서 `<App>`을 감싸 렌더/
  라이프사이클 오류를 잡고 **하얀 화면 대신** 안내를 띄운다(새로고침 + 저장 데이터 초기화 탈출구 —
  손상 데이터가 흔한 원인이라). 로그는 콘솔에만(외부 전송 없음). 일시 안내는 `notice` 토스트
  (`role="status" aria-live="polite"`), 폼 검증은 `role="alert"`로 접근성 확보.
  **모달 접근성**: `useDialogA11y(onClose)` 훅이 오버레이(체크 시트·루틴 폼)에 포커스를 옮기고, **Esc로
  닫기·Tab 포커스 트랩·닫을 때 트리거로 포커스 복귀**를 준다. 오버레이는 `role="dialog" aria-modal`,
  아이콘 버튼(✕)은 `aria-label`. onClose는 ref로 잡아 effect는 마운트 1회만(매 렌더 포커스 재탈취 방지).

## 로드맵 단계 메모

- Phase 1: ~~#1 실제 날짜~~(완료 · PR #11) · ~~#2 localStorage 영속화 + 데모 시드 제거~~(완료 · PR #13)
- Phase 2: ~~#3 반응형 전체화면(목업 프레임 제거)~~(완료) · ~~#4 PWA~~(완료) · ~~#5 배포~~(완료 —
  서버 세팅·터널까지 끝났고 2026-07-20 CI 자동배포 경로를 실측 검증했다. 절차·롤백은 `deploy/README.md`)
- 백로그: ~~#16 루틴별 찬스 시스템~~(완료 · PR #23 로직 · #24 토글/배지 · #25 기타찬스) —
  저장 스키마 v2가 확정됐으므로 #7 동기화 설계는 이 스키마 위에서 한다
- 운영 후속 **#20**(열림): CI 최적화는 PR #21로 반영됐고, 머지된 원격 브랜치 정리·
  `relay.chillingdaisy.org` DNS 등 소소한 항목이 남아 있다
- Phase 3: ~~#7 백엔드·계정·클라우드 동기화~~(**완료** · 1/4 스캐폴드 PR #27 · 2/4 저장소 PR #28 ·
  3/4 클라이언트 동기화 엔진 PR #30 · 4/4 활성화·마이그레이션·상태 UI PR #32 — 설정에서 켜면 owner를
  바인딩해 엔진 활성화) · ~~#6 알림~~(**완료** · 1단계 권한+베스트에포트+시각편집 PR #34 · 2a 서버 Web Push
  구독·발송 파이프라인 PR #35 · 2b 매일 정시 크론 PR #37) — **Phase 3(동기화·알림) 전체 완료**
- **다음 → #8 품질**(테스트·접근성·에러 처리·브랜딩, 상시) · #20 운영 후속(열림)
