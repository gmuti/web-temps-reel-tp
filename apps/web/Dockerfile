# Contexte de build : la racine du monorepo (nécessaire pour accéder au
# workspace partagé ../../shared depuis npm workspaces).
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY scripts/linux-native-deps.cjs ./scripts/

# ---- Développement (hot reload, code monté en volume) ----
# shared est reconstruit au démarrage du conteneur (pas au build) car le code
# est monté en volume : un shared/dist figé au build serait aussitôt masqué.
FROM base AS dev
# Binaires natifs Linux absents du lockfile généré sous Windows (cf. scripts/linux-native-deps.cjs).
RUN npm install && npm install --no-save --ignore-scripts $(node scripts/linux-native-deps.cjs)
CMD ["sh", "-c", "cd /app && npm run build --workspace shared && cd /app/apps/web && npm run dev -- --host"]

# ---- Build de production ----
FROM base AS build
# Binaires natifs Linux absents du lockfile généré sous Windows (cf. scripts/linux-native-deps.cjs).
RUN npm ci && npm install --no-save --ignore-scripts $(node scripts/linux-native-deps.cjs)
COPY shared ./shared
COPY apps/web ./apps/web
RUN npm run build --workspace shared
WORKDIR /app/apps/web
RUN npm run build

# ---- Image de production ----
FROM nginx:alpine AS prod
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
CMD ["nginx", "-g", "daemon off;"]
