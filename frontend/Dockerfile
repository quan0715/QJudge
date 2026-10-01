# Build stage
FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Use lockfile for reproducible CI/CD builds
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Gateway config: routes, forwarded-proto map, and real IP from trusted proxies.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/00-forwarded-proto.conf /etc/nginx/conf.d/00-forwarded-proto.conf
COPY --chmod=755 nginx/20-qjudge-real-ip.sh /docker-entrypoint.d/20-qjudge-real-ip.sh
COPY --chmod=755 nginx/30-qjudge-addons.sh /docker-entrypoint.d/30-qjudge-addons.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
