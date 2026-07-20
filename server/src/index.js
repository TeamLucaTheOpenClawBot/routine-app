// 루틴 앱 동기화 API — 의존성 0개(Node 내장만).
//
// native 모듈(better-sqlite3 등)을 쓰면 node_modules가 타깃 아키텍처로 빌드돼야 해서
// arm64 이미지에서 QEMU npm install이 되살아난다(#20에서 없앤 경로). 내장 모듈만 쓴다.
//
// 이 PR은 스캐폴드다 — 데이터 저장·동기화 엔드포인트는 #7의 다음 PR에서 붙인다.

import { createServer } from 'node:http';
import { createJwksCache, extractAccessToken, verifyAccessJwt } from './access.js';

const PORT = Number(process.env.PORT ?? 8081);
const TEAM_DOMAIN = process.env.ACCESS_TEAM_DOMAIN?.replace(/\/+$/, '');
const AUD = process.env.ACCESS_AUD;
// 로컬 개발 전용 우회. compose·CI 어디에도 설정하지 않는다.
const DEV_NO_AUTH = process.env.DEV_NO_AUTH === '1';

// fail-closed: 설정이 없으면 뜨지 않는다. Access 정책을 대시보드에서 붙이기 전에
// API가 열려 있는 창을 만들지 않기 위한 것 — 설정 누락이 곧 '무인증 공개'가 되면 안 된다.
if (!DEV_NO_AUTH && (!TEAM_DOMAIN || !AUD)) {
  console.error('ACCESS_TEAM_DOMAIN·ACCESS_AUD가 필요합니다 (미설정 시 기동하지 않음). 로컬 개발은 DEV_NO_AUTH=1.');
  process.exit(1);
}
if (DEV_NO_AUTH) console.warn('⚠️  DEV_NO_AUTH=1 — 인증을 건너뜁니다. 로컬 개발 전용입니다.');

const getJwks = TEAM_DOMAIN ? createJwksCache({ teamDomain: TEAM_DOMAIN }) : null;

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

async function authenticate(req) {
  if (DEV_NO_AUTH) return { ok: true, email: 'dev@localhost', sub: 'dev' };
  const token = extractAccessToken(req.headers);
  if (!token) return { ok: false, reason: 'missing_token' };
  let jwks;
  try {
    jwks = await getJwks();
  } catch {
    // 키를 못 가져오면 통과시키지 않는다(fail-closed).
    return { ok: false, reason: 'jwks_unavailable' };
  }
  return verifyAccessJwt(token, { jwks, aud: AUD, issuer: TEAM_DOMAIN });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // 헬스체크는 무인증 — 컨테이너 healthcheck와 CI 스모크가 쓴다. 상태 외 정보는 노출하지 않는다.
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { status: 'ok' });
  }

  if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });

  const auth = await authenticate(req);
  if (!auth.ok) {
    // 401의 이유를 그대로 돌려준다 — 클라이언트가 '세션 만료(재인증 필요)'와 '동기화 실패'를
    // 구분해야 사용자에게 이유를 설명할 수 있다(#7 설계의 함정 2).
    return json(res, 401, { error: 'unauthorized', reason: auth.reason });
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    return json(res, 200, { email: auth.email, sub: auth.sub });
  }

  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`routine-app API listening on ${PORT}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
