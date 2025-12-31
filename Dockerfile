FROM node:18-slim

WORKDIR /app

# Install Python and dependencies for data science/plotting
# Using apt packages is reliable on Debian
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-numpy \
    python3-pandas \
    python3-matplotlib \
    python3-pil \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create models directory for local cache
RUN mkdir -p /app/models && chown -R node:node /app/models

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
