FROM node:24-bookworm-slim

ENV NODE_ENV=production
WORKDIR /opt/lawdesk

COPY backend/package.json backend/package-lock.json ./backend/
WORKDIR /opt/lawdesk/backend
RUN npm ci --omit=dev --ignore-scripts=false \
    && npm cache clean --force

WORKDIR /opt/lawdesk
COPY --chown=node:node backend ./backend
COPY --chown=node:node database ./database

RUN mkdir -p /var/lib/lawdesk/attachments \
    && chown -R node:node /var/lib/lawdesk

USER node
WORKDIR /opt/lawdesk/backend

EXPOSE 3001

CMD ["node", "scripts/startProduction.js"]
