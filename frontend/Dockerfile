FROM node:24-alpine AS build

WORKDIR /opt/lawdesk/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM nginx:stable-alpine

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /opt/lawdesk/frontend/dist /usr/share/nginx/html

USER nginx

EXPOSE 8080
