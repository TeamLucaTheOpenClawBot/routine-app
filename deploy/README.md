# 배포 가이드 — Oracle VM + Docker + Cloudflare Tunnel

```text
main 머지 → GitHub Actions: 이미지 빌드(multi-arch)·스모크 → GHCR push(private 유지)
          → CI가 서버로 SSH: 1회용 GITHUB_TOKEN docker login → pull → up -d → logout
사용자 → https://routine.chillingdaisy.org (Cloudflare) → 터널(luca-main) → 서버 localhost:8080 (nginx)
```

- 컨테이너는 `127.0.0.1:8080`에만 바인딩 — 외부 노출은 cloudflared 터널이 담당.
  OCI Security List 포트 개방 불필요.
- 서버(Oracle Ampere)는 **aarch64** → 이미지는 반드시 multi-arch(amd64+arm64)로 publish.
- GHCR 패키지는 **private 유지**. 배포 시 1회용 `GITHUB_TOKEN`으로 pull 후 즉시 logout —
  서버에 영구 GitHub 자격증명이 남지 않는다.

## 배포 자격 (설정 완료)

- repo Actions 시크릿: `DEPLOY_HOST` · `DEPLOY_USER` · `DEPLOY_SSH_KEY` · `DEPLOY_KNOWN_HOSTS`
- `DEPLOY_SSH_KEY`는 **배포 전용 ed25519 키**(관리용 키와 별개). 서버 `authorized_keys`에
  `no-port-forwarding,no-agent-forwarding,no-X11-forwarding` 제한과 함께 등록됨.
- `DEPLOY_KNOWN_HOSTS`는 호스트 키 핀닝 — keyscan(TOFU) 대신 이 값만 신뢰하므로 스푸핑 시
  토큰 전송 전에 접속이 실패한다. **값은 raw `.pub` 파일이 아니라 호스트가 포함된 완전한
  known_hosts 한 줄**(`<서버IP> ssh-ed25519 AAAA...`)이어야 한다 — OpenSSH는 호스트명으로
  먼저 매칭하므로 호스트 없인 모든 배포가 접속 단계에서 실패한다. 갱신 명령:

  ```bash
  echo "<서버IP> $(ssh <서버> cat /etc/ssh/ssh_host_ed25519_key.pub)" \
    | gh secret set DEPLOY_KNOWN_HOSTS --repo TeamLucaTheOpenClawBot/routine-app
  ```

- 키 회전: 새 키 생성 → 서버 authorized_keys 교체 → `gh secret set DEPLOY_SSH_KEY` 갱신.
  서버 호스트 키 재설치 시엔 `DEPLOY_KNOWN_HOSTS`도 위 형식으로 갱신.

## 서버 1회 세팅 (완료)

- `/opt/routine-app/` 디렉토리 · 배포 전용 공개키 authorized_keys 등록
- **compose 파일은 CI가 매 배포마다 이 디렉토리의 `docker-compose.yml`을 서버로 복사한다**
  (레포가 단일 원본). 예전엔 1회 수동 배치라 레포에 서비스를 추가해도 서버에 반영되지 않았다.
  → 배포 사용자에게 쓰기 권한이 필요하다. 한 번만:

  ```bash
  sudo chown -R <DEPLOY_USER> /opt/routine-app
  ```

  서버에만 두는 `.env`(Access 값)는 복사 대상이 아니므로 덮어쓰이지 않는다.

## 동기화 API 켜기 (#7 — 사용자 수동 단계)

API 서비스는 compose `profiles: ["api"]`로 **기본 비활성**이다. 아래를 마치기 전까지는 배포돼도
기동하지 않고, `/api/`는 502를 낸다(앱 서빙엔 영향 없음). 인증은 Cloudflare Access가 담당하므로
**앱에 인증 코드가 없다** — Access를 붙이지 않은 채 켜면 안 된다.

1. **Cloudflare Zero Trust → Access → Applications → Add an application (Self-hosted)**
   - Application domain: `routine.chillingdaisy.org`, **Path: `api/*`**
     (앱 본체에는 걸지 않는다 — 정적 셸까지 Access 뒤로 넣으면 PWA 오프라인 로드가 로그인
     리다이렉트에 막힌다.)
   - **와일드카드가 필수다.** Path를 `api`로만 두면 정확히 `/api`에만 정책이 적용되고
     실제 호출 경로인 `/api/me`·`/api/sync`는 정책 밖이라 Access JWT가 발급·전달되지 않는다
     → API가 전부 `missing_token` 401이 되어 쓸 수 없다. (API는 fail-closed라 이 경우
     '열리는' 게 아니라 '안 되는' 쪽으로 넘어지지만, 원인을 모르면 한참 헤맨다.)
     [Cloudflare 문서](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/):
     하위 경로까지 보호하려면 Path를 비우거나 와일드카드를 쓴다.
   - Policy: Allow → Emails → 본인 이메일
   - 생성 후 **Application Audience (AUD) Tag**를 복사한다.
2. **팀 도메인 확인** — Zero Trust → Settings → Custom Pages 등에 표시되는
   `https://<team>.cloudflareaccess.com`.
3. **서버에 `.env` 생성** (compose 파일과 같은 디렉토리).
   위 `chown`을 마쳤다면 **`sudo` 없이 배포 사용자로** 만든다:

   ```bash
   cat > /opt/routine-app/.env <<'EOF'
   COMPOSE_PROFILES=api
   ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com
   ACCESS_AUD=<AUD 태그>
   EOF
   chmod 600 /opt/routine-app/.env
   ```

   > **`sudo tee`로 만들지 말 것.** 그러면 `root:root 0600`이 되고, CI 배포는 `DEPLOY_USER`로
   > 접속해 `docker compose`를 실행하므로 이 파일을 **읽지 못한다** → `COMPOSE_PROFILES`가
   > 적용되지 않아 **다음 배포에서 API가 조용히 빠진다**(수동으로 켤 땐 되는데 배포하면
   > 사라지는 형태로 나타난다). 이미 root 소유로 만들었다면:
   > `sudo chown <DEPLOY_USER> /opt/routine-app/.env`
   >
   > 확인: `sudo -u <DEPLOY_USER> head -1 /opt/routine-app/.env` 가 읽히면 정상.

4. **기동·확인** — compose 파일과 API 이미지는 CI가 이미 서버에 준비해 둔다
   (GHCR이 private이라 배포 중 로그인 상태에서 미리 받아둔다 → 여기서 `docker login` 불필요).

   ```bash
   cd /opt/routine-app && docker compose up -d
   curl -fsS http://localhost:8080/api/health            # {"status":"ok"} — 무인증 허용
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/me   # 401 (토큰 없음)
   ```

5. **Access가 하위 경로까지 덮는지 확인** (위 와일드카드 실수를 잡는 단계):

   ```bash
   # 로그인 세션 없이 외부에서 — Access 로그인으로 리다이렉트(302)돼야 한다.
   curl -s -o /dev/null -w '%{http_code}\n' https://routine.chillingdaisy.org/api/me
   ```

   - `302`(또는 로그인 페이지 HTML) → **정상**. Access가 `/api/me`를 덮고 있다.
   - `401` + `{"error":"unauthorized","reason":"missing_token"}` → **Access 경로 설정이 잘못됐다.**
     요청이 정책을 안 거치고 그대로 우리 API에 닿았다는 뜻 → Path를 `api/*`로 고친다.

   그다음 브라우저로 같은 URL 접속 → Access 로그인 후 `{"email": ...}`가 나오면 끝.

**설계상 fail-closed다**: `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`가 비어 있으면 API 컨테이너는 기동하지
않는다. 설정 누락이 곧 '무인증 공개'가 되는 상황을 막기 위한 것이며, 크래시 루프를 피하려고
profile로 이중 잠금해 둔 것이다.

## Cloudflare 터널 ingress

`~/.cloudflared/config.yaml`의 ingress에 404 캐치올 **위에** 추가:

```yaml
  - hostname: routine.chillingdaisy.org
    service: http://localhost:8080
```

DNS 라우트 등록(1회): `cloudflared tunnel route dns luca-main routine.chillingdaisy.org`
적용: `sudo systemctl restart luca-cloudflared` — **주의: 같은 터널의 다른 서비스가 몇 초 순단**된다.

## 검증

```bash
# 서버에서
curl -fsSI http://localhost:8080/ | head -3
# 외부에서
curl -fsSI https://routine.chillingdaisy.org/ | head -5                      # 200
curl -fsSI https://routine.chillingdaisy.org/sw.js | grep -i cache-control   # no-cache
```

폰 브라우저 접속 → "홈 화면에 추가" → 비행기 모드 실행(오프라인 확인).

## 롤백

- **빠른 길**: 배포 스크립트가 pull 전에 직전 latest를 **`:previous`로 재태그**해 항상 1개 보존한다
  (배포 간격 무관 — prune은 dangling만 지우므로 태그가 있는 previous는 살아남는다).

  ```bash
  docker tag ghcr.io/teamlucatheopenclawbot/routine-app:previous \
             ghcr.io/teamlucatheopenclawbot/routine-app:latest
  docker compose up -d routine-app
  ```

- **정석**: 되돌릴 커밋을 main에 revert-머지하면 CI가 그 시점 이미지를 새로 배포한다.
  (GHCR엔 sha 태그도 있지만 private이라 서버 단독 pull은 불가 — CI 경유가 기본.)
