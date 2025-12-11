# Build stage
FROM node:20-alpine as build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Delete package-lock.json and reinstall to get platform-specific binaries
# This is needed because package-lock.json may be generated on a different platform (e.g., macOS)
# and won't include Linux ARM64 musl binaries required by Alpine
RUN rm -f package-lock.json && npm install

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
