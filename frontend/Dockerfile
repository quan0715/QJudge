# Build stage
FROM node:20-alpine as build

WORKDIR /app

# Allow Docker build args to flow into the Vite build.
ARG RECUR_PUBLISHABLE_KEY=""
ENV RECUR_PUBLISHABLE_KEY=${RECUR_PUBLISHABLE_KEY}

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

# Copy nginx config
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
