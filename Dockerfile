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

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio
CMD ["node", "dist/index.js"]
