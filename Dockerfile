# 1) 빌드 스테이지 — 정적 번들(dist) 생성.
# --platform=$BUILDPLATFORM: 산출물(dist)은 정적 파일이라 아키텍처 무관 → 타깃이 arm64여도
# 이 스테이지는 러너 네이티브(amd64)로 돌린다. QEMU에서 npm ci/vite build를 에뮬레이션하면
# 행이 걸려 런이 70분씩 소모됐다(#20). 멀티아치가 실제로 필요한 건 아래 nginx 스테이지뿐.
FROM --platform=$BUILDPLATFORM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# 2) 서빙 스테이지 — nginx가 dist를 서빙 (PWA 캐시 규칙은 deploy/nginx.conf)
FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
