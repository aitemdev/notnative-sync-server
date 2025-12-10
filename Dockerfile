FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar todas las dependencias (incluyendo devDependencies para compilar)
RUN npm ci

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# Limpiar devDependencies después de compilar
RUN npm prune --production

# Crear directorio para uploads
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Exponer puertos (HTTP API + WebSocket)
EXPOSE 3000 3001

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000
ENV WS_PORT=3001
ENV UPLOAD_DIR=/app/uploads

# Cambiar a usuario no-root
USER node

# Comando de inicio
CMD ["node", "dist/index.js"]
