FROM node:22-bookworm-slim

ENV PYTHONUNBUFFERED=1
ENV FETCH_MCP_COMMAND=/opt/fetch-venv/bin/mcp-server-fetch
ENV HOST=0.0.0.0
ENV PORT=10000

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/fetch-venv \
    && /opt/fetch-venv/bin/pip install --no-cache-dir mcp-server-fetch==2026.10.10

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.mjs ./

EXPOSE 10000
USER node
CMD ["node", "server.mjs"]
