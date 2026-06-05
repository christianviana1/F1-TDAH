# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Instala dependências nativas necessárias para oracledb thin mode
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Variáveis dummy para o build não falhar (valores reais vêm no runtime via env)
ENV NEXTAUTH_SECRET=build_placeholder
ENV NEXTAUTH_URL=http://localhost:3000
ENV ORACLE_USER=build_placeholder
ENV ORACLE_PASSWORD=build_placeholder
ENV ORACLE_CONNECT_STRING=build_placeholder
ENV ORACLE_WALLET_LOCATION=/app/wallet
ENV ORACLE_WALLET_PASSWORD=build_placeholder

RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache libc6-compat

# Usuário não-root por segurança
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia apenas o necessário do build
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Cria pasta para a Oracle Wallet (será montada como volume no Coolify)
RUN mkdir -p /app/wallet && chown -R nextjs:nodejs /app/wallet

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
