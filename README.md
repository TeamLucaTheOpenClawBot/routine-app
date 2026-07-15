# 루틴 체크 (Routine Tracker)

주 단위로 스크롤하는 모바일 습관 체크 캘린더 앱. 한 주가 하나의 카드이고, 각 날짜 칸에
루틴 아이콘이 표시된다. 날짜를 탭해 그날의 루틴 완료를 토글하고, "관리"에서 루틴을
추가/편집하며, "통계"에서 달성률과 연속 달성 주를 본다. 지난 주 목표를 달성하면 해당
루틴이 캘린더에서 빛난다(glow).

React 18 + Vite로 구현. 디자인은 [`design_handoff_routine_tracker/`](design_handoff_routine_tracker/)의
핸드오프 스펙을 따른다.

## 핵심 규칙

- 루틴 1~5개. 추가/삭제·표시/숨기기 가능.
- 각 루틴은 주간 목표를 가진다: **"주 N회 이상"(atLeast, 늘리는 습관)** 또는
  **"주 N회 이하"(atMost, 줄이는 습관)**.
- 주간 목표 달성 판정은 **지난(완료된) 주만 확정**. 이번 주는 항상 "진행 중".
- 기본 루틴: 운동(주 7회 이상), 음주(주 1회 이하).

## 개발

```bash
npm install     # 최초 1회
npm run dev     # 개발 서버
npm test        # 단위 테스트 (vitest)
npm run build   # 프로덕션 빌드 → dist/
```

## 구조

```
src/
  App.jsx          앱 셸 · 캘린더 · 체크/관리/통계 시트 · 온보딩
  appLogic.js      데이터 모델 · 주간 판정 · 시드 데이터 (순수 로직)
  appLogic.test.js appLogic 단위 테스트
  index.css        전역 스타일 · 디자인 토큰
  main.jsx         엔트리
design_handoff_routine_tracker/   디자인 핸드오프 스펙 (참고용)
```

> 참고: 현재 상태는 인메모리 목업(새로고침 시 초기화)이며, `appLogic.js`의 `TODAY`가
> 2026-07-15로 고정돼 있다. 실제 서비스에는 로컬 저장(localStorage/IndexedDB 등)과
> `new Date()` 적용이 필요하다.
