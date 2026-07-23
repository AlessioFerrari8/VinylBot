# Stage 1: build dell'app Angular (SPA statica, nessun SSR)
# Angular 22 richiede Node >=22.22.3 per la build
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: serve i file statici con nginx
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/website/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
