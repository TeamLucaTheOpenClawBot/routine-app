# 동기화 API — 의존성이 0개라 install 스테이지도, node_modules도 없다.
# 그래서 이 이미지는 소스를 복사만 하면 되고, 멀티아치 빌드가 QEMU에서 아무것도 컴파일하지 않는다
# (native 모듈을 쓰면 node_modules가 타깃 아키텍처로 빌드돼야 해서 #20에서 없앤 QEMU 경로가 되살아난다).
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
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
