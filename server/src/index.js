// 루틴 앱 동기화 API — 의존성 0개(Node 내장만).
//
// native 모듈(better-sqlite3 등)을 쓰면 node_modules가 타깃 아키텍처로 빌드돼야 해서
// arm64 이미지에서 QEMU npm install이 되살아난다(#20에서 없앤 경로). 내장 모듈만 쓴다.
//
// 이 PR은 스캐폴드다 — 데이터 저장·동기화 엔드포인트는 #7의 다음 PR에서 붙인다.

import { createServer } from 'node:http';
import { createJwksCache, extractAccessToken, verifyWithRotation } from './access.js';
import { createStore, openDatabase } from './store.js';
import { createPushStore, normalizeSubscription } from './push-store.js';
import { createPushSender } from './push-send.js';

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

// DB 파일은 볼륨에 둔다(컨테이너 교체에도 남아야 한다). 미지정 시 메모리 — 로컬 개발용.
// 동기화 store와 푸시 구독 store가 **같은 DB**를 공유한다(신원 키가 같다).
const db = openDatabase(process.env.DB_PATH ?? ':memory:');
const store = createStore(db);
const pushStore = createPushStore(db);

// Web Push(#6 2단계). VAPID 키가 없으면 sender는 null — 푸시 발송은 비활성이고(구독 저장은 계속),
// /api/push/key는 null을 돌려줘 클라이언트가 구독을 시도하지 않는다(키 미설정이 크래시가 아니라 '푸시 없음').
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const pushSender = createPushSender({
  publicKey: VAPID_PUBLIC,
  privateKey: process.env.VAPID_PRIVATE_KEY || '',
  subject: process.env.VAPID_SUBJECT || '',
});

// 본문 상한. 없으면 큰 요청 하나로 메모리를 밀어올릴 수 있다.
const MAX_BODY = 2 * 1024 * 1024;

function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        // 여기서 destroy하면 클라이언트는 연결 끊김만 보고 이유를 모른다(413을 못 받는다).
        // 읽기만 멈춰 두고(TCP 백프레셔) 호출자가 413을 보낸 뒤 끊게 한다.
        req.pause();
        resolve({ error: 'too_large' });
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({ value: {} });
      try {
        resolve({ value: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ error: 'invalid_json' });
      }
    });
    req.on('error', () => resolve({ error: 'read_failed' }));
  });
}

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
  // 키 회전 대응은 verifyWithRotation이 맡는다(모르는 kid면 1회 강제 갱신 후 재시도).
  return verifyWithRotation(token, { getJwks, aud: AUD, issuer: TEAM_DOMAIN });
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

  // 밀어넣기와 당겨오기를 한 왕복으로 처리한다 — 둘로 나누면 그 사이에 중간 상태가 생긴다.
  if (req.method === 'POST' && url.pathname === '/api/sync') {
    const body = await readJsonBody(req);
    if (body.error === 'too_large') {
      // 응답이 나간 뒤에 끊는다 — 먼저 끊으면 413이 전달되지 않는다.
      res.on('finish', () => req.destroy());
      return json(res, 413, { error: 'too_large', limit: MAX_BODY });
    }
    if (body.error) return json(res, 400, { error: body.error });

    // 본문은 객체여야 한다. `null`·배열·숫자도 유효한 JSON이라 여기서 걸러야 한다 —
    // 특히 `null`은 store.sync의 구조분해에서 던져 클라이언트 입력 오류가 500 + 스택
    // 트레이스로 기록된다(진짜 장애를 찾을 때 노이즈가 된다).
    const payload = body.value;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      return json(res, 400, { error: 'invalid_body' });
    }

    // 소유자는 요청 본문이 아니라 **검증된 신원**에서 가져온다(본문에서 받으면 남의 데이터를
    // 지목할 수 있다). 키는 email이 아니라 **sub**다 — 이메일은 바뀌고 재할당될 수 있어서,
    // 재할당된 주소로 로그인한 다른 사람이 앞사람 데이터를 읽고 덮어쓸 수 있다.
    // 반대급부로 IdP를 바꾸면 sub가 달라져 데이터가 사라진 것처럼 보일 수 있는데,
    // 그건 재키잉으로 복구한다(절차는 deploy/README.md).
    const owner = auth.sub;
    if (!owner) return json(res, 401, { error: 'unauthorized', reason: 'no_subject' });

    // 클라이언트가 기대하는 소유자를 함께 보내면 세션 소유자와 대조해 다르면 거부한다. 클라이언트가
    // 신원을 확인한 뒤 이 요청을 보내기까지 사이에 (다른 탭 재인증 등으로) 세션이 바뀌면, 확인·쓰기가
    // 별개 요청이라 남의 계정에 데이터가 쓰인다 — expectedOwner를 여기서 검증해 그 TOCTOU를 한
    // 요청 안에서 닫는다. 최초 동기화(owner 미확정)엔 없으므로 있을 때만 대조한다. 쓰기 전에 막는다.
    if (typeof payload.expectedOwner === 'string' && payload.expectedOwner !== owner) {
      return json(res, 409, { error: 'owner_mismatch', owner });
    }

    try {
      return json(res, 200, store.sync(owner, payload));
    } catch (err) {
      console.error('sync 실패:', err);
      return json(res, 500, { error: 'sync_failed' });
    }
  }

  // ── Web Push (#6 2단계) ────────────────────────────────────────────────
  // 구독은 sync와 같은 검증된 신원(sub)에 묶는다. 소유자는 본문이 아니라 auth에서 온다.
  if (url.pathname.startsWith('/api/push/')) {
    const owner = auth.sub;
    if (!owner) return json(res, 401, { error: 'unauthorized', reason: 'no_subject' });

    // 클라이언트가 구독에 쓸 VAPID 공개키. 키가 없으면 null → 클라이언트는 구독을 시도하지 않는다.
    if (req.method === 'GET' && url.pathname === '/api/push/key') {
      return json(res, 200, { publicKey: VAPID_PUBLIC || null });
    }

    if (req.method === 'POST' && url.pathname === '/api/push/subscribe') {
      const body = await readJsonBody(req);
      if (body.error === 'too_large') {
        res.on('finish', () => req.destroy());
        return json(res, 413, { error: 'too_large', limit: MAX_BODY });
      }
      if (body.error) return json(res, 400, { error: body.error });
      const sub = normalizeSubscription(body.value);
      if (!sub) return json(res, 400, { error: 'invalid_subscription' });
      try {
        pushStore.add(owner, sub, Date.now());
        return json(res, 200, { ok: true });
      } catch (err) {
        console.error('push subscribe 실패:', err);
        return json(res, 500, { error: 'subscribe_failed' });
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/push/unsubscribe') {
      const body = await readJsonBody(req);
      if (body.error) return json(res, 400, { error: body.error });
      const endpoint = body.value && typeof body.value === 'object' ? body.value.endpoint : null;
      if (typeof endpoint !== 'string' || !endpoint) return json(res, 400, { error: 'invalid_endpoint' });
      pushStore.remove(owner, endpoint);
      return json(res, 200, { ok: true });
    }

    // 구독이 실제로 도달하는지 확인하는 테스트 발송(설정의 "테스트 알림"에서 호출). 키 미설정이면 503.
    if (req.method === 'POST' && url.pathname === '/api/push/test') {
      if (!pushSender) return json(res, 503, { error: 'push_disabled' });
      const subs = pushStore.listByOwner(owner);
      if (!subs.length) return json(res, 200, { sent: 0 });
      try {
        const sent = await pushSender.sendToAll(
          subs,
          { title: '루틴 체크', body: '테스트 알림이에요. 잘 도착했어요! 🎉', url: '/' },
          (endpoint) => pushStore.removeEndpoint(endpoint),
        );
        return json(res, 200, { sent });
      } catch (err) {
        console.error('push test 실패:', err);
        return json(res, 500, { error: 'test_failed' });
      }
    }

    return json(res, 404, { error: 'not_found' });
  }

  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`routine-app API listening on ${PORT}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
