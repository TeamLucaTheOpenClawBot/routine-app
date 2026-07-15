# Handoff: 루틴 체크 (Weekly Habit Calendar) — 모바일 PWA

## Overview
주 단위로 위아래 스크롤하는 습관 체크 캘린더 앱. 한 주가 하나의 카드이고, 각 날짜 칸에 루틴 아이콘이 표시된다. 날짜를 탭하면 하단 시트에서 그날의 루틴 완료를 토글하고, "관리"에서 루틴을 추가/편집(이름·아이콘·색·주간 목표·표시숨기기)하며, "통계"에서 달성률과 연속 달성 주를 본다. 지난 주 목표를 달성하면 해당 루틴이 캘린더에서 빛난다(glow).

핵심 규칙:
- 루틴 개수 1~5개. 사용자가 추가/삭제, 표시/숨기기 가능.
- 각 루틴은 주간 목표를 가진다: **"주 N회 이상"(atLeast, 늘리는 습관)** 또는 **"주 N회 이하"(atMost, 줄이는 습관)**. 사용자가 편집.
- 루틴은 단색 SVG 아이콘 + 사용자 지정 색.
- 주간 목표 달성 판정은 **지난(완료된) 주만 확정**. 이번 주는 항상 "진행 중"(달성/초과 확정 안 함).
- 샘플 루틴: 운동(주 7회 이상), 음주(주 1회 이하). 밀도 데모용으로 물 마시기(주 7회 이상)·독서(주 3회 이상)가 프로토타입에 추가돼 있음 — 실제 기본값은 운동·음주 2개만 두는 것이 원 요구사항.

## About the Design Files
이 번들의 파일은 **HTML로 만든 디자인 레퍼런스(프로토타입)** 입니다 — 의도한 룩앤필과 동작을 보여주는 것이지, 그대로 복사해 배포할 프로덕션 코드가 아닙니다. 작업 목표는 이 HTML 디자인을 **대상 코드베이스의 기존 환경(React Native / Flutter / Swift / 웹 등)과 패턴·라이브러리에 맞춰 재구현**하는 것입니다. 아직 환경이 없다면, 모바일 PWA에 적합한 프레임워크(예: React + Vite + PWA, 혹은 React Native)를 선택해 구현하세요.

프로토타입은 내부적으로 "Design Component(.dc.html)" 런타임을 쓰지만, 이는 이 도구의 프리뷰용일 뿐이며 대상 앱과 무관합니다. 로직/뷰모델 코드는 구현 참고용으로 읽으세요.

## Fidelity
**High-fidelity (hifi).** 색·타이포·간격·인터랙션이 확정된 목업입니다. 아래 스펙대로 픽셀에 가깝게 재현하되, 컬러/타이포/라운드/섀도는 GymCheck 디자인 토큰(`tokens.css`)을 그대로 사용하세요.

## Design Tokens
`tokens.css` 참조. 프로토타입에서 실제로 쓰인 값:

**Brand / Primary**
- `--color-primary` #0EA5A4 (딥 틸, 주 강조 — 오늘 표시, 관리 버튼, 완료 체크)
- `--color-primary-50` #F0FDFA (오늘 셀 배경 tint, 표시 토글 배경)
- `--color-primary-dark` #0E7C7B
- `--gradient-brand` linear-gradient(135deg,#0EA5A4,#16A34A) (온보딩 CTA)

**Neutrals**
- `--color-text` #111827 (본문 텍스트)
- `--color-muted` #64748B (보조 텍스트, 요일)
- `--color-bg` #F1F5F9 (앱/스크롤 배경)
- `--color-surface` #FFFFFF (카드, 시트)
- `--color-border` #E2E8F0 (카드·셀 테두리)
- `--color-field-border` #CBD5E1 (미완료 아이콘 색, 스텝퍼 비활성, 미체크 원)
- 미완료 아이콘 셀 배경 dot: #E2E8F0 / 미완료 아이콘 stroke: #CBD5E1

**Radius**
- `--radius` 18px (카드), `--radius-field` 10px, `--radius-pill` 999px (배지/칩)
- 커스텀: 아이콘 박스 7px, 시트 상단 26px, 시트 행 16px, 관리 카드 16px

**Shadow**
- `--shadow-sm` 0 1px 3px rgba(15,23,42,.08) (카드)
- `--shadow-lg` 0 16px 40px rgba(15,23,42,.16) (폰 프레임, 시트)

**Font**: `--font-sans` = Pretendard, system-ui, … (한국어 우선)

**루틴 색 팔레트** (사용자 선택용, 8색):
`#0EA5A4 #16A34A #2563EB #7C3AED #E11D48 #F59E0B #0891B2 #DB2777`

**주말 색**: 일요일 텍스트 #E11D48, 토요일 텍스트 #2563EB

## Data Model
```
Routine {
  id: string
  name: string
  iconKey: 'dumbbell'|'wine'|'drop'|'book'|'moon'|'leaf'|'run'|'pencil'
  color: string   // 팔레트 hex
  goalType: 'atLeast' | 'atMost'
  goalCount: number   // atLeast 1..7, atMost 0..6
  visible: boolean
}
checks: { [dateKey 'YYYY-MM-DD']: { [routineId]: true } }  // 완료 기록
```
주간 판정: 해당 주(일~토) 내 루틴 완료 일수 `cnt`.
- atLeast 달성 = `cnt >= goalCount`
- atMost 달성 = `cnt <= goalCount`
- **완료된 주(주 토요일 < 오늘)만 판정 적용.** 이번 주/미래 주는 판정/글로우 없음.

## Screens / Views

### 1. 메인 캘린더 (Weekly Cards)
- **Purpose**: 주별 습관 현황 확인, 날짜 탭으로 체크.
- **Layout**:
  - 폰 프레임 390×844, `--color-bg` 배경, radius 44, `--shadow-lg`.
  - 상단 상태바 44px (9:41 / 5G / 배터리 목업), `--color-surface` 배경.
  - 앱 헤더: 좌측 월 타이틀 20px/800 + 보조문구 12.5px `--color-muted`("이번 주 n/m 순항 중"), 우측 "통계"(고스트: bg `--color-bg`, `--color-muted`) + "관리"(bg `--color-primary`, #fff) 버튼. 패딩 8/18/12, 하단 border. `--color-surface` 배경.
  - 스크롤 영역: 세로 스크롤, 카드 리스트, 패딩 12, 카드 간 gap 11. **로드 시 오늘이 포함된 주로 자동 스크롤.**
  - 범위: 과거 8주 ~ 미래 2주(총 11주). 오래된 주가 위, 최신이 아래.
- **주 카드 컴포넌트** (`--color-surface`, radius 18, border `--color-border`, `--shadow-sm`, 패딩 13; **이번 주 카드는 border 1.5px `--color-primary`**):
  - 헤더 행: 좌측 날짜범위 "5.17 – 5.23" 13.5px/800. 이번 주면 "이번 주" pill(`--color-primary-50`/`--color-primary`, 10.5px/800). 우측 **달성 칩**: 그 주 목표 달성 루틴들의 아이콘을 원형 칩(22px, bg = 루틴색 16%, ring + glow, `glowPulse` 애니메이션)으로 표시. → 줄이는 습관(음주)은 완료 아이콘이 거의 없어도 이 칩으로 달성이 드러남.
  - 요일 그리드: 7열. 각 날짜 칸(세로 flex, tap 영역):
    - 요일 라벨 10px/700(주말 색), 날짜 숫자 12.5px/700. **오늘은 22px 틸 원형 배경 + 흰 숫자.** 미래 날짜는 #CBD5E1.
    - 아이콘 클러스터: 표시된 각 루틴 아이콘을 18px 박스에 2열로 wrap(가운데 정렬). **완료 = 박스 bg 루틴색 15% + 아이콘 stroke 루틴색; 미완료 = 투명 bg + stroke #CBD5E1(흐림).** 완료+달성주면 ring+glow. 미래 날짜는 아이콘 미표시.

### 2. 날짜 체크 시트 (Bottom Sheet)
- 날짜 탭 시 하단에서 슬라이드. scrim rgba(15,23,42,.34) + 시트 패널(`--color-surface`, 상단 radius 26, `--shadow-lg`, max-height 84%).
- 헤더: "7월 13일" 19px/800 + "월요일" 보조. 우측 닫기 원형 버튼(bg `--color-bg`, ✕).
- 표시된 루틴마다 행: 40px 아이콘 박스(루틴색 tint) + 이름 15.5px/700 + 목표문구("주 7회 이상") + 우측 체크 컨트롤. **완료 = 30px 틸 원형 + 흰 ✓; 미완료 = 2px `--color-field-border` 빈 원.** 행 전체 tap = 토글, 완료 행은 bg 루틴색 7%.

### 3. 관리 시트 (Manage / Add / Edit)
- 헤더 "루틴 관리" + 닫기. 스크롤 리스트.
- 루틴 카드마다(border `--color-border`, radius 16, 패딩 13):
  - 상단 행: 44px 아이콘 박스 + 이름 `<input>`(15.5px/700) + "표시/숨김" 토글(표시=`--color-primary-50`/`--color-primary`, 숨김=`--color-bg`/`--color-muted`) + 삭제(휴지통 SVG, 루틴 1개일 땐 비활성 opacity .35).
  - 목표 편집 행: 세그먼트 토글 [이상 | 이하](선택=`--color-primary`/#fff), 우측 스텝퍼 [− 주 N회 +](−/+ 28px 버튼, 경계값에서 비활성 색 `--color-field-border`).
  - 색 스와치 행: 8색 원형(26px), 선택 시 2px 흰 링 + 2px 색 링.
  - 아이콘 선택 행: 8개 아이콘(34px 박스), 선택 시 루틴색 tint + 1.5px 색 ring.
- 하단 "＋ 루틴 추가 (n/5)" 대시 버튼. 5개면 비활성. 추가 시 기본값(이름 "새 루틴", 미사용 색/아이콘, 주 3회 이상) 생성.

### 4. 통계 시트 (Stats)
- 헤더 "통계" + "최근 8주 기준 · 달성률과 현재 연속".
- 표시된 루틴마다: 32px 아이콘 + 이름 + 목표문구, 우측 달성률 %(16px/800 루틴색) + "연속 N주". 아래 진행 바(높이 8, bg `--color-bg`, 채움 = 루틴색, width = 달성률%).
- 달성률 = 완료된 주 중 목표 달성 주 비율. 연속 = 최신 완료 주부터 연속 달성 수.

### 5. 온보딩 / 빈 상태
- 루틴 0개일 때. 중앙 정렬: 브랜드 로고(틸 체크) + "매일의 루틴, 한 눈에 채워보세요" 22px/800 + 보조문구 + 3단계 안내 카드(번호 원 + 제목 + 설명) + 하단 그라디언트 CTA "첫 루틴 만들기"(min-height 56, `--gradient-brand`). CTA → 관리 시트로 연결.

## Interactions & Behavior
- **날짜 탭 → 체크 시트.** 미래 날짜는 탭 불가.
- **아이콘/체크 토글**: `checks[dateKey][routineId]` on/off. 즉시 캘린더·통계·달성 칩 재계산.
- **자동 스크롤**: 마운트 후 오늘 포함 주로 스크롤(약간의 지연 후, 레이아웃 안정화 대비 재시도).
- **glow**: `@keyframes glowPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.14)} }`, 2.6s ease-in-out infinite. 달성 주의 완료 아이콘 + 달성 칩에 ring(0 0 0 1.5px 색90%) + soft glow(0 0 8px 색50%).
- 시트류는 하단 슬라이드 + scrim 탭으로 닫기. 한 번에 하나만 오픈(시트/관리/통계 상호 배타).
- 히트 타깃 ≥ 44px 지향(모바일).

## State Management
- 전역: `routines: Routine[]`, `checks`, UI 상태(`sheetDay|null`, `showManager`, `showStats`).
- 파생: 주별 뷰모델(주 범위, 이번주/미래 여부, 완료된 주 여부, 루틴별 주간 count·달성, 날짜별 아이콘 상태·glow), 통계(달성률·연속).
- 데이터 fetching: 프로토타입은 인메모리 목업(저장 안 함). 실제 앱은 로컬 저장(예: IndexedDB/localStorage 또는 서버 동기화) 필요.
- 날짜: 주 시작 = 일요일. dateKey = 로컬 'YYYY-MM-DD'. (프로토타입은 오늘을 2026-07-15로 고정 — 실제 앱은 `new Date()` 사용.)

## Assets
- **아이콘**: 8종 단색 라인 SVG(24×24 viewBox, stroke, `strokeWidth` 2, round cap/join)를 코드로 그림. path 정의는 `루틴 체크.dc.html`의 `ICONS` 객체 참조(dumbbell/wine/drop/book/moon/leaf/run/pencil, + 관리 삭제용 trashbin). 대상 앱에선 동등한 아이콘 세트(lucide 등)로 대체 가능하나, 단색 + 사용자 색 지정 원칙 유지.
- **로고**: GymCheck 브랜드 마크(디자인 시스템 제공). 대상 코드베이스의 브랜드 마크로 대체.
- 외부 이미지/폰트 없음(Pretendard는 디자인 시스템 폰트).

## Files
- `루틴 체크.dc.html` — 메인 앱: 상태·데이터 모델·뷰모델 로직 + 앱 셸. 아이콘 path, 시드 데이터, 주간 판정/통계 계산이 여기 있음(구현 참고 핵심).
- `RoutinePhone.dc.html` — 폰 UI 렌더러: 카드 캘린더 + 체크/관리/통계 시트 + 온보딩 마크업(레이아웃·인라인 스타일 참고).
- `tokens.css` — 디자인 토큰(색·radius·shadow·폰트).
- `support.js` — .dc.html 프리뷰 런타임(대상 앱과 무관, 무시).
