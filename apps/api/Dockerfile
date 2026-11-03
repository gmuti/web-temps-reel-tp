# Contexte de build : la racine du monorepo (nécessaire pour accéder au
# workspace partagé ../../shared depuis npm workspaces).
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY scripts/linux-native-deps.cjs ./scripts/

# ---- Développement (hot reload, code monté en volume) ----
# shared est reconstruit et le client Prisma régénéré au démarrage du
# conteneur (pas au build) car le code est monté en volume et DATABASE_URL
# n'est disponible qu'au runtime (fourni par docker-compose).
FROM base AS dev
# Binaires natifs Linux absents du lockfile généré sous Windows (cf. scripts/linux-native-deps.cjs).
RUN npm install && npm install --no-save --ignore-scripts $(node scripts/linux-native-deps.cjs)
# Démarrage complet en une commande : migrations appliquées puis données de démo
# (seed idempotent) à chaque lancement, avant l'API.
CMD ["sh", "-c", "cd /app && npm run build --workspace shared && cd /app/apps/api && npx prisma generate && npx prisma migrate deploy && npx prisma db seed && npm run start:dev"]

# ---- Build de production ----
FROM base AS build
# Binaires natifs Linux absents du lockfile généré sous Windows (cf. scripts/linux-native-deps.cjs).
RUN npm ci && npm install --no-save --ignore-scripts $(node scripts/linux-native-deps.cjs)
COPY shared ./shared
COPY apps/api ./apps/api
RUN npm run build --workspace shared
WORKDIR /app/apps/api
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# ---- Image de production ----
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci --omit=dev
COPY --from=build /app/shared/dist ./shared/dist
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/
WORKDIR /app/apps/api
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
COPY --from=build /app/apps/api/dist ./dist
CMD ["node", "dist/main.js"]
