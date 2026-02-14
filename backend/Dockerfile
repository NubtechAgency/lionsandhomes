# Dockerfile para Backend - Node.js + TypeScript + Prisma
# Multi-stage build para optimizar tamaño de imagen

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# OpenSSL requerido por Prisma para generar binarios correctos
RUN apk add --no-cache openssl

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY src ./src

# Generar Prisma Client
RUN npx prisma generate

# Compilar TypeScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# OpenSSL requerido por Prisma schema engine
RUN apk add --no-cache openssl

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar Prisma schema para migraciones
COPY prisma ./prisma/

# Copiar código compilado desde builder
COPY --from=builder /app/dist ./dist

# Copiar node_modules con Prisma Client generado
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Exponer puerto
EXPOSE 8000

# Comando de inicio
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
