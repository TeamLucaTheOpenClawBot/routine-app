# 동기화·푸시 API. 의존성은 **web-push 하나**(#6 2단계) — 순수 JS라 native 컴파일이 없어
# 멀티아치 빌드가 QEMU에서 아무것도 빌드하지 않는다(#20에서 없앤 QEMU 경로를 되살리지 않는다).
# node:sqlite는 여전히 내장 모듈이라 install이 필요 없다.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# lockfile 기준으로 정확히 설치(--omit=dev). 순수 JS라 arch별 빌드가 없다.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src

# SQLite 파일이 놓일 자리. **USER 전환 전에** 만들고 소유권을 넘긴다 —
# named volume은 최초 마운트 시 이미지의 해당 경로 소유권을 물려받으므로,
# 여기서 잡아두지 않으면 root 소유가 되어 비특권 프로세스가 DB를 못 만든다.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

# 루트로 돌리지 않는다. node 이미지가 제공하는 비특권 사용자를 쓴다.
USER node

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:8081/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
