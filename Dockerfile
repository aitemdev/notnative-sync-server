FROM node:18-alpine

WORKDIR /app

# Install Python and dependencies for data science/plotting
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /app/venv \
    && . /app/venv/bin/activate \
    && pip install --no-cache-dir matplotlib pandas numpy pillow

# Add venv to PATH
ENV PATH="/app/venv/bin:$PATH"

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
