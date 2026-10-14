FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY lib/ ./lib/

# Default mapping — mount your own at /app/mapping.json
COPY mapping.example.json ./mapping.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/health || exit 1

USER node

CMD ["node", "server.js"]
