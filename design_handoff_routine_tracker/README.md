# Handoff: 루틴 체크 (Weekly Habit Tracker) — 모바일 PWA · 다크 테마

## Overview
주 단위로 스크롤하는 습관 체크 앱. 하단 탭바로 **캘린더 · 오늘 · 통계 · 설정** 4개 화면을 오가고, 루틴 추가/편집은 전체 화면 폼으로 처리한다. 각 루틴은 주간 목표(주 N회 이상/이하)를 가지며, 지난(완료된) 주 목표를 달성하면 캘린더에서 해당 루틴이 빛난다(glow). **다크 테마** 기준.

핵심 규칙:
- 루틴 1~5개. 사용자가 추가/삭제, 표시/숨기기.
- 목표: **atLeast(주 N회 이상, 늘리는 습관)** 또는 **atMost(주 N회 이하, 줄이는 습관)**. 사용자가 편집.
- 단색 SVG 아이콘 + 사용자 지정 색.
- 주간 달성은 **지난(완료된) 주만 확정**. 이번 주는 항상 진행 중.
- 샘플: 운동(activity 아이콘, 주 7회 이상), 음주(beer 아이콘, 주 1회 이하). 밀도 데모용으로 물 마시기·독서가 프로토타입에 추가돼 있음(실제 기본은 운동·음주 2개면 충분).

## About the Design Files
이 번들의 파일은 **HTML로 만든 디자인 레퍼런스(프로토타입)** 입니다 — 룩앤필과 동작을 보여주는 것이지 그대로 배포할 코드가 아닙니다. 목표는 이 디자인을 **대상 코드베이스의 기존 환경(React Native / Flutter / Swift / 웹 PWA 등)과 패턴에 맞춰 재구현**하는 것. 환경이 없다면 모바일 PWA에 맞는 스택(예: React + Vite + vite-plugin-pwa)을 선택해 구현하세요. 프로토타입은 내부적으로 "Design Component(.dc.html)" 런타임을 쓰지만 이는 프리뷰용이며 대상 앱과 무관합니다 — 로직·아이콘·뷰모델은 구현 참고용으로만 읽으세요.

## Fidelity
**High-fidelity (hifi).** 색·타이포·간격·인터랙션 확정. 아래 스펙대로 재현하되 토큰은 다크 팔레트 사용.

## Navigation
- **하단 탭바(고정)**: 캘린더 · 오늘 · 통계 · 설정. 활성 탭 = 브랜드 틸 아이콘+라벨(800), 비활성 = 슬레이트 #94A3B8.
- 캘린더의 날짜 탭 → 체크 바텀시트. 설정의 루틴 행/‘루틴 추가’ → **전체 화면 폼**(취소/저장 상단바). 캘린더 헤더의 + 도 폼을 연다.
- 시트/폼은 프레임 내부 오버레이(폼은 탭바 위까지 덮는 전체 화면).

## Design Tokens (Dark)
라이트 토큰(`tokens.css`)을 `body`에서 다크로 오버라이드해 사용. 모든 UI가 `var(--color-*)`를 참조하므로 이 오버라이드 한 곳만 바꾸면 테마가 바뀐다.

```css
/* 다크 오버라이드 (프로토타입에서 body에 적용) */
--color-bg:        #0B1220;   /* 앱/스크롤 배경 */
--color-surface:   #161F30;   /* 카드·시트·상태바·탭바 */
--color-text:      #EEF2F7;   /* 본문 */
--color-muted:     #94A3B8;   /* 보조·요일 평일 */
--color-border:    #27324A;   /* 카드·구분선 */
--color-field-border:#3A4963; /* 입력·미완료 아이콘·비활성 */
--color-primary-50: rgba(14,165,164,0.16); /* 틸 tint: 오늘 셀/추가버튼/뱃지 */
--color-active-text:#4ADE80;  /* 달성 강조 */
--color-expired-bg: rgba(220,38,38,0.18);  /* 삭제 버튼 배경 */
--color-expired-text:#FCA5A5; /* 삭제 버튼 텍스트 */
/* 유지: --color-primary #0EA5A4, --gradient-brand, --radius(18)/field(10)/pill */
```
그 외 하드코딩 값(다크 기준): 미완료/비활성 = `var(--color-field-border)`; 히트맵 빈칸 = `rgba(148,163,184,0.22)`; 주말 색 일요일 `#FB7185`·토요일 `#60A5FA`; 통계 요약 accent 틸/`#22C55E`/`#60A5FA`. 보드/앱 최상위 배경 `#0B1220`.

**루틴 색 팔레트(8):** `#0EA5A4 #16A34A #2563EB #7C3AED #E11D48 #F59E0B #0891B2 #DB2777`
**Radius 커스텀:** 아이콘 박스 6~14, 시트 상단 26, 카드 16~18, 폼 미리보기 22
**Shadow:** `--shadow-sm`(카드), `--shadow-lg`(프레임·시트). **Font:** Pretendard.

## Data Model
```
Routine { id, name, iconKey, color, goalType:'atLeast'|'atMost', goalCount:number, visible:boolean }
checks: { [dateKey 'YYYY-MM-DD']: { [routineId]: true } }
appSettings: { weekStart: 0(일)|1(월), notif: boolean, remindHour: number }
```
주간 판정(주 시작=weekStart): 그 주 완료 일수 cnt → atLeast `cnt>=goalCount`, atMost `cnt<=goalCount`. **완료된 주(그 주 토요일<오늘)만 확정·glow.**

## Screens

### 탭 1 · 캘린더
위클리 카드 세로 스크롤. 헤더(월 타이틀 20/800 + "이번 주 n/m 순항 중" + `+`버튼). 스티키 요일 헤더(7열). 로드 시 오늘 주로 자동 스크롤. 범위 과거 8주~미래 2주.
- 주 카드(surface, radius 18, border, shadow-sm; 이번 주는 1.5px 틸 border): 헤더에 날짜범위 "5.17 – 5.23" + "이번 주" pill + 우측 **달성 칩**(달성 루틴 아이콘 원형, ring+glow). 7열 날짜 칸: 요일(10/700)·날짜(12.5/700, 오늘=22px 틸 원형+흰숫자, 미래=field-border). 아이콘 클러스터 18px 박스 2열 wrap — 완료=색 tint bg+색 아이콘(+달성주 glow), 미완료=투명+field-border 아이콘.

### 탭 2 · 오늘
헤더 "오늘" 25/800 + 날짜 + **진행 링**(conic-gradient 틸, 중앙 흰 원에 n/total·"완료"). 큰 루틴 행(radius 18, shadow-sm): 48px 아이콘 박스 + 이름 16.5/700 + "이번 주 3/7회"(atLeast)·"이번 주 0회 · 한도 1"(atMost) + 30px 체크(완료 틸 원+흰✓). 행 탭=토글.

### 탭 3 · 통계 대시보드
헤더 "통계" + "최근 8주 인사이트". **요약 3카드**(이번 주 달성 n/m·최고 연속 n주·평균 달성률 %). 루틴별 카드: 아이콘+이름+목표, 우측 달성률(18/800 색)+연속, 진행 바(색), **최근 10주 히트맵**(달성=색 사각, 미달=반투명).

### 탭 4 · 설정
헤더 "설정". 섹션: **루틴 관리**(카드 리스트 — 아이콘·이름·목표 + 표시/숨김 토글 + chevron, 행 탭=편집 폼; 하단 "루틴 추가 (n/5)"), **알림**(매일 리마인더 스위치 + "매일 21:00 알림"), **캘린더**(주 시작 요일 일/월 세그).

### 루틴 추가/편집 폼 (전체 화면)
상단바: 취소 | 제목 | 저장(틸). 본문: 큰 아이콘 미리보기(76, 색 tint) + 이름 입력(가운데). 섹션 **아이콘**(4열 그리드, 선택=색 ring+tint), **색**(8 스와치, 선택=흰+색 이중 ring), **주간 목표**(세그 "이상(늘리기)/이하(줄이기)" + 스텝퍼 −/+ + "주 N회 이상" 미리보기). 편집 모드 & 루틴 2개 이상이면 하단 **루틴 삭제**(expired 색). 추가 모드에서 취소=생성 취소(삭제).

### 온보딩 / 빈 상태
루틴 0개일 때(탭 무관). 로고 + "매일의 루틴, 한 눈에 채워보세요" + 3단계 안내 + 그라디언트 CTA "첫 루틴 만들기"(→ 추가 폼).

## Interactions & Behavior
- 탭 전환으로 화면 스위치(활성 탭 상태 per user). 날짜/오늘 행 탭=완료 토글 → 캘린더·통계·달성 칩 즉시 재계산.
- glow: `@keyframes glowPulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.14)}}` 2.6s. 달성 주 완료 아이콘 + 달성 칩에 ring(색90%)+soft glow(색50%).
- 주 시작 요일 변경 시 캘린더/요일헤더/주간 집계가 해당 기준으로 재계산.
- 시트=하단 슬라이드+scrim 탭 닫기. 폼=전체 화면. 히트 타깃 ≥44px.

## State Management
- 전역: `routines[]`, `checks`, `weekStart`, `notif/remindHour`, UI(`activeTab`, `sheetDay`, `showForm`/`formMode`/`editingId`).
- 파생: 탭별 뷰모델(주 카드/오늘 링·행/통계 요약·행·히트맵/설정 리스트/폼). 통계=완료된 주 대상 달성률·현재 연속.
- 프로토타입은 인메모리 목업(저장 안 함, TODAY=2026-07-15 고정). 실제 앱은 로컬 영속화(IndexedDB/localStorage) 또는 서버 동기화 + `new Date()`.

## Assets
- **아이콘**(24×24 stroke, sw 2, round): activity(운동·맥박선), beer(음주·맥주잔), drop, book, moon, leaf, run, pencil, dumbbell + UI용 calendar/todaycheck/chart/gear/plus/chevron/trashbin. path는 `루틴 체크.dc.html`의 `ICONS` 참조. 대상 앱에선 lucide 등 동등 세트로 대체 가능(단색+사용자 색 원칙 유지).
- **로고**: GymCheck 브랜드 마크(디자인 시스템). 대상 브랜드 마크로 대체.
- 외부 이미지/폰트 없음.

## Files
- `루틴 체크.dc.html` — 상태·데이터 모델·주간 판정/통계 계산·아이콘 path·뷰모델·다크 토큰 오버라이드(핵심 참고).
- `RoutinePhone.dc.html` — 폰 UI: 탭바 + 4개 화면 + 체크 시트 + 전체화면 폼 + 온보딩 마크업/스타일.
- `tokens.css` — 라이트 기준 디자인 토큰(다크는 위 오버라이드 참고).
- `support.js` — .dc.html 프리뷰 런타임(대상 앱과 무관, 무시).
