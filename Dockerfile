# 1) 빌드 스테이지 — 정적 번들(dist) 생성
FROM node:20-alpine AS build
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
