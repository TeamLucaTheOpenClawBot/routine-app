# 배포 가이드 — Oracle VM + Docker + Cloudflare Tunnel

```text
main 머지 → GitHub Actions: 이미지 빌드·스모크 → GHCR push
          → 서버 watchtower: 5분 내 자동 pull·재시작
사용자 → https://routine.chillingdaisy.org (Cloudflare) → 터널 → 서버 localhost:8080 (nginx 컨테이너)
```

컨테이너는 `127.0.0.1:8080`에만 바인딩된다 — 외부 노출은 cloudflared 터널이 담당하므로
OCI Security List에서 포트를 열 필요가 없다.

## 서버 1회 세팅

```bash
# 0) 도구 확인 (없으면 설치)
docker --version && docker compose version

# 1) GHCR 로그인 — 프라이빗 이미지 pull 자격
#    GitHub PAT(classic, read:packages 권한만) 발급: https://github.com/settings/tokens
echo <PAT> | docker login ghcr.io -u <github-username> --password-stdin

# 2) compose 배치 및 기동
sudo mkdir -p /opt/routine-app && cd /opt/routine-app
#   (이 repo의 deploy/docker-compose.yml 내용을 이 경로에 복사)
docker compose up -d

# 3) 동작 확인
curl -fsSI http://localhost:8080/ | head -3
```

> GHCR 이미지는 최초 CI publish(main 머지) 후 생긴다. 그 전에 `up -d` 하면 pull 실패가 정상.
> 대안: 패키지를 public으로 바꾸면(GitHub → Packages → routine-app → settings) 로그인 없이 pull 가능.

## Cloudflare 터널 ingress 추가

기존 터널(예: `app.chillingdaisy.org`를 서빙 중인 것)에 hostname 하나만 추가한다.

- **대시보드 관리 터널**: Zero Trust → Networks → Tunnels → 해당 터널 → Public Hostname 추가
  → `routine.chillingdaisy.org` → Service `http://localhost:8080`. (DNS 레코드 자동 생성)
- **config.yml 관리 터널**: ingress에 아래 항목을 404 캐치올 **위에** 추가 후 cloudflared 재시작:

  ```yaml
  - hostname: routine.chillingdaisy.org
    service: http://localhost:8080
  ```

  DNS 라우트 등록: `cloudflared tunnel route dns <터널이름> routine.chillingdaisy.org`

## 배포 검증

```bash
curl -fsSI https://routine.chillingdaisy.org/ | head -5                      # 200
curl -fsSI https://routine.chillingdaisy.org/sw.js | grep -i cache-control   # no-cache
curl -fsSI https://routine.chillingdaisy.org/manifest.webmanifest | grep -i content-type
```

폰 브라우저로 접속 → "홈 화면에 추가" → 비행기 모드에서 실행(오프라인 확인).

## 롤백

```bash
# GHCR 태그는 커밋 sha별로도 push된다. 특정 버전으로 고정:
docker compose pull && docker compose up -d          # 최신 반영(수동)
# 또는 compose image 태그를 ghcr.io/...:{sha} 로 바꿔 up -d
```
