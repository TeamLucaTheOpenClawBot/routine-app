import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 다크 테마 대비 점검(#8). 색은 index.css의 토큰이 원장이므로 **파일에서 실제 값을 읽어** 계산한다 —
// 테스트에 색을 하드코딩하면 토큰을 바꿔도 테스트가 통과해 버려 검사가 죽는다.
// 기준: WCAG 2.1 AA — 본문 글자 4.5:1, UI 컴포넌트 경계·상태 표식 3:1.
const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf8');

function token(name) {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`토큰 없음: --${name}`);
  return m[1].trim();
}

const parse = (value) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (!rgba) throw new Error(`파싱 불가: ${value}`);
  const parts = rgba[1].split(',').map((p) => Number(p.trim()));
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
};

// 반투명 tint는 그대로 비교할 수 없다 — 깔린 배경과 합성한 실제 색으로 계산해야 화면과 일치한다.
const flatten = (value, behind) => {
  const { rgb, alpha } = parse(value);
  if (alpha === 1) return rgb;
  const base = parse(behind).rgb;
  return rgb.map((c, i) => Math.round(c * alpha + base[i] * (1 - alpha)));
};

const channel = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACE = token('color-surface');
const BG = token('color-bg');
const TINT = flatten(token('color-primary-50'), SURFACE);
const CHANCE_TINT = flatten(token('color-chance-50'), SURFACE);
const EXPIRED_BG = flatten(token('color-expired-bg'), SURFACE);

// [설명, 앞색, 뒷배경, 최소 대비]
const TEXT = [
  ['본문', token('color-text'), SURFACE, 4.5],
  ['보조(muted) — 카드 위', token('color-muted'), SURFACE, 4.5],
  ['보조(muted) — 배경 위', token('color-muted'), BG, 4.5],
  ['비활성·부재 글자 — 카드 위', token('color-disabled-text'), SURFACE, 4.5],
  ['비활성·부재 글자 — 배경 위', token('color-disabled-text'), BG, 4.5],
  ['강조 틸 글자 — 카드 위', token('color-primary'), SURFACE, 4.5],
  ['틸 tint 위 글자', token('color-primary-text'), TINT, 4.5],
  ['채운 틸 버튼 위 흰 글자', '#ffffff', token('color-primary-strong'), 4.5],
  ['찬스 앰버 — 카드 위', token('color-chance'), SURFACE, 4.5],
  ['찬스 앰버 — tint 위', token('color-chance'), CHANCE_TINT, 4.5],
  ['달성 강조', token('color-active-text'), SURFACE, 4.5],
  ['삭제·오류 글자', token('color-expired-text'), EXPIRED_BG, 4.5],
  ['주말 일', token('color-sun'), BG, 4.5],
  ['주말 토', token('color-sat'), BG, 4.5],
];

// 상태를 전달하는 테두리·표식은 3:1(UI 컴포넌트 기준). 빈 체크 원(미완료)·히트맵 '기록 없음' 칸이 이것에 해당한다.
const UI = [['의미 있는 테두리(outline)', token('color-outline'), SURFACE, 3]];

describe('다크 테마 대비 (WCAG AA · #8)', () => {
  it.each(TEXT)('%s — 4.5:1 이상', (_label, fg, bg, min) => {
    expect(contrast(typeof fg === 'string' ? flatten(fg, bg) : fg, typeof bg === 'string' ? flatten(bg, BG) : bg)).toBeGreaterThanOrEqual(min);
  });

  it.each(UI)('%s — 3:1 이상', (_label, fg, bg, min) => {
    expect(contrast(flatten(fg, bg), flatten(bg, BG))).toBeGreaterThanOrEqual(min);
  });

  // 대비가 낮아 **글자·상태 표식에 쓰면 안 되는** 장식 토큰. 용도를 지켜야 위 검사가 의미를 갖는다.
  it('장식용 토큰은 UI에서 글자색으로 쓰이지 않는다', () => {
    const app = readFileSync(`${process.cwd()}/src/App.jsx`, 'utf8');
    expect(app).not.toMatch(/color:\s*'var\(--color-field-border\)'/);
    expect(app).not.toMatch(/color:\s*'var\(--color-border\)'/);
  });
});
