# 루틴 체크 (Routine Tracker) · 다크 테마

주 단위 습관 체크 앱. 하단 탭바로 **캘린더 · 오늘 · 통계 · 설정** 4개 화면을 오가고,
루틴 추가/편집은 전체 화면 폼으로 처리한다. 각 루틴은 주간 목표(주 N회 이상/이하)를
가지며, 지난(완료된) 주 목표를 달성하면 캘린더에서 해당 루틴이 빛난다(glow). **다크 테마** 기준.

React 18 + Vite로 구현. 디자인은 [`design_handoff_routine_tracker/`](design_handoff_routine_tracker/)의
핸드오프 스펙을 따른다.

## 화면

- **캘린더** — 위클리 카드 세로 스크롤. 로드 시 오늘 주로 자동 스크롤. 날짜 탭 → 체크 시트.
- **오늘** — 오늘 할 루틴만 크게. 진행 링 + 큰 체크 토글.
- **통계** — 요약 3카드(이번 주 달성·최고 연속·평균 달성률) + 루틴별 달성률·연속·최근 10주 히트맵.
- **설정** — 루틴 관리(표시/숨김·편집)·알림·주 시작 요일·데이터 초기화.

## 핵심 규칙

- 루틴 1~5개. 추가/삭제·표시/숨기기 가능.
- 각 루틴은 주간 목표를 가진다: **"주 N회 이상"(atLeast, 늘리는 습관)** 또는
  **"주 N회 이하"(atMost, 줄이는 습관)**.
- 주간 목표 달성 판정은 **지난(완료된) 주만 확정**. 이번 주는 항상 "진행 중".
- **찬스** — 컨디션 난조·특별한 사정으로 하루를 킵하는 장치. 체크는 3-상태(안함 → 했음 → 찬스)이고,
  찬스로 킵한 날은 목표에 유리하게 집계된다(늘리는 습관은 한 것으로, 줄이는 습관은 카운트 제외).
  보유는 루틴별로 **주 1개 + 월 1개**(주/달이 바뀌면 자동 복귀, 쌓이지 않음)에 더해 사유를 적어
  직접 만드는 **기타찬스**(개수 제한 없음). 소진 순서는 주 → 월 → 기타이고, 찬스를 되돌리면 복원된다.
- 주 시작 요일(일/월)은 설정에서 변경 가능 — 캘린더·요일 헤더·주간 집계가 함께 재계산된다.
- 첫 방문은 기본 루틴 운동(주 6회 이상)·음주(주 1회 이하) 2개로 시작한다(프로토타입 데모 시드 없음). 이후 상태는 `localStorage`에 유지된다.

## 개발

```bash
npm install     # 최초 1회
npm run dev     # 개발 서버 (SW 비활성)
npm test        # 단위 테스트 (vitest)
npm run build   # 프로덕션 빌드 → dist/ (PWA 서비스워커·매니페스트 포함)
npm run preview # 빌드본 미리보기 (SW·오프라인 검증은 여기서)
```

## PWA (홈 화면 설치 · 오프라인)

`vite-plugin-pwa`로 빌드 시 서비스워커(`sw.js`)와 매니페스트(`manifest.webmanifest`)를 생성한다.
앱 셸을 precache + `navigateFallback`으로 **오프라인에서도 로드**되고, 모바일에서 **"홈 화면에 추가"**로
독립 실행(standalone)된다. 브랜드 아이콘(틸 체크)은 `public/`에 192/512/maskable/apple-touch로 제공.
SW·오프라인은 빌드본에서만 동작하므로 `npm run preview`로 검증한다.

## 배포

`main` 머지 시 GitHub Actions가 Docker 이미지(nginx + `dist/`, multi-arch)를 빌드·검증해
GHCR로 push한 뒤, **CI가 서버로 SSH 배포**한다(1회용 토큰 pull → `compose up` → logout).
외부 노출은 Cloudflare Tunnel(`routine.chillingdaisy.org` → 서버 `localhost:8080`) —
공인 포트 개방 없음. 상세(자격·터널·검증·롤백)는 [deploy/README.md](deploy/README.md).

## 구조

```text
src/
  App.jsx          앱 셸 · 탭바 · 4개 화면 · 체크 시트 · 편집 폼 · 온보딩 · 동기화 배선
  appLogic.js      데이터 모델 · 주간 판정 · 찬스 · 통계 · 영속화 · 동기화 순수 로직
  syncClient.js    동기화 HTTP 왕복(postSync/getMe) — 응답 분류
  appLogic.test.js · sync.test.js · syncClient.test.js   순수 로직 단위 테스트
  App.test.jsx     App 구동 · 영속화 통합 테스트
  index.css        다크 테마 디자인 토큰 · 전역 스타일
  main.jsx         엔트리
server/            동기화·푸시 API — native 의존성 0(순수 JS web-push 하나), Cloudflare Access JWT 검증
  src/index.js     HTTP 핸들러(POST /api/sync · GET /api/me · 헬스체크)
  src/store.js     SQLite(node:sqlite) 셀 단위 merge 저장소(+ store.test.js)
  src/access.js    Access JWT 검증(RS256 고정 · aud/iss)(+ access.test.js)
  src/rekey.js     소유자 키 이관(IdP 변경 복구)
public/            PWA 아이콘(logo.svg 소스 · pwa-*/maskable/apple-touch/favicon)
vite.config.js     Vite · vitest · vite-plugin-pwa(매니페스트·SW) 설정
design_handoff_routine_tracker/   디자인 핸드오프 스펙 (참고용)
```

> 참고: 실제 날짜는 `appLogic.js`의 `startOfToday()`(자정 기준 런타임 `new Date()`)로 동작한다
> — #1 완료로 `TODAY` 고정 상수는 제거됐다. 상태(루틴·체크·설정)는 #2 완료로 `localStorage`(`routine-app:v2`)에
> 영속화되어 새로고침해도 유지된다. 다기기 동기화(#7)도 완료 — 설정의 "클라우드 동기화"에서 켜면
> 여러 기기가 같은 기록을 쓴다(Cloudflare Access 로그인 · 셀 단위 병합, `server/` API). 알림(#6)도
> 완료 — 권한·앱 열림 시 리마인더·시각 편집(1단계)에 더해, 서버 Web Push로 앱이 꺼져 있어도 매일 정시에
> 미완료 알림이 온다(VAPID 설정 시 · 설정의 "잠금 화면 알림"에서 기기 등록). 남은 것: 품질·접근성(#8).
