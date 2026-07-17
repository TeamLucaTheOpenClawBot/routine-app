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

- `/opt/routine-app/docker-compose.yml` 배치 (이 디렉토리의 compose 파일)
- 배포 전용 공개키 authorized_keys 등록

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

- **빠른 길(7일 이내)**: 배포 시 prune이 `--filter until=168h`라 **직전 이미지가 로컬에 남아 있다**.
  `docker image ls ghcr.io/teamlucatheopenclawbot/routine-app`에서 직전 이미지 ID 확인 →
  `docker tag <ID> ghcr.io/teamlucatheopenclawbot/routine-app:latest && docker compose up -d routine-app`.
- **정석**: 되돌릴 커밋을 main에 revert-머지하면 CI가 그 시점 이미지를 새로 배포한다.
  (GHCR엔 sha 태그도 있지만 private이라 서버 단독 pull은 불가 — CI 경유가 기본.)
