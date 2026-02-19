# Dockerfile para Frontend - React + Vite + Nginx
# Multi-stage build para optimizar tamaño

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Variable de entorno para la URL del backend (se inyecta en build time)
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Build de producción
RUN npm run build

# Stage 2: Servir con Nginx
FROM nginx:alpine

# Copiar archivos estáticos desde builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración personalizada de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Usar usuario nginx built-in (non-root)
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid
USER nginx

# Exponer puerto
EXPOSE 80

# Comando de inicio (nginx se inicia automáticamente)
CMD ["nginx", "-g", "daemon off;"]
