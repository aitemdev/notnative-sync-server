#!/bin/bash

# NotNative VPS Server - Docker Deployment Script
# Usage: ./deploy-docker.sh

set -e

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "🐳 Iniciando despliegue de NotNative VPS Server..."
echo "=========================================="
echo ""

# Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    log_error "No se encontró package.json. Por favor ejecuta este script desde el directorio vps-server/"
    exit 1
fi

# Verificar si hay cambios locales que puedan causar conflicto
if git status --porcelain | grep -q .; then
    log_warn "Detectados cambios locales. Haciendo stash automático..."
    git stash push -m "Automated stash before deploy - $(date)"

    if [ $? -ne 0 ]; then
        log_error "Falló el stash automático. Por favor resuelve los conflictos manualmente."
        exit 1
    fi

    log_info "✅ Cambios guardados temporalmente"
fi

# Paso 1: Pull latest code
echo ""
echo "------------------------------------------"
log_info "Paso 1/5: Actualizando código desde repositorio..."
echo "------------------------------------------"

git pull origin main

if [ $? -ne 0 ]; then
    log_error "Falló el git pull. Verifica que tienes acceso al repositorio."
    exit 1
fi

log_info "✅ Código actualizado correctamente"

# Paso 2: Instalar dependencias
echo ""
echo "------------------------------------------"
log_info "Paso 2/5: Instalando dependencias..."
echo "------------------------------------------"

npm install

if [ $? -ne 0 ]; then
    log_error "Falló la instalación de dependencias"
    exit 1
fi

log_info "✅ Dependencias instaladas correctamente"

# Paso 3: Compilar TypeScript
echo ""
echo "------------------------------------------"
log_info "Paso 3/5: Compilando TypeScript..."
echo "------------------------------------------"

npm run build

if [ $? -ne 0 ]; then
    log_error "Falló la compilación de TypeScript"
    exit 1
fi

log_info "✅ TypeScript compilado correctamente"

# Paso 4: Verificar que dist/ existe
echo ""
echo "------------------------------------------"
log_info "Paso 4/5: Verificando compilación..."
echo "------------------------------------------"

if [ ! -d "dist" ]; then
    log_error "No se encontró el directorio dist/. La compilación falló."
    exit 1
fi

if [ ! -f "dist/index.js" ]; then
    log_error "No se encontró dist/index.js. La compilación falló."
    exit 1
fi

log_info "✅ Verificación de compilación exitosa"

# Paso 5: Reconstruir contenedor Docker
echo ""
echo "------------------------------------------"
log_info "Paso 5/5: Reconstruyendo contenedor Docker..."
echo "------------------------------------------"

if [ -f "docker-compose.yml" ]; then
    log_info "Reconstruyendo contenedor Docker con docker compose..."

    docker compose down

    if [ $? -ne 0 ]; then
        log_warn "Advertencia: docker compose down falló, pero continuando..."
    fi

    docker compose build --no-cache

    if [ $? -ne 0 ]; then
        log_error "Falló la construcción del contenedor Docker"
        exit 1
    fi

    log_info "✅ Contenedor Docker reconstruido exitosamente"
else
    log_warn "No se encontró docker-compose.yml, saltando reconstrucción Docker"
    log_info "Si usas Docker manualmente, ejecuta: docker compose build"
fi

# Paso 6: Iniciar servicios
echo ""
echo "------------------------------------------"
log_info "Paso 6/6: Iniciando servicios..."
echo "------------------------------------------"

if [ -f "docker-compose.yml" ]; then
    log_info "Iniciando servicios con docker compose up -d..."

    docker compose up -d

    if [ $? -ne 0 ]; then
        log_error "Falló el inicio de los servicios Docker"
        exit 1
    fi

    # Esperar unos segundos para que el servicio inicie
    echo ""
    log_info "Esperando 5 segundos para que el servicio inicie..."
    sleep 5

    # Mostrar logs de inicio
    echo ""
    echo "------------------------------------------"
    log_info "Logs de inicio del servicio:"
    echo "------------------------------------------"
    docker compose logs --tail=50

    log_info "✅ Servicios Docker iniciados exitosamente"
else
    log_warn "No se encontró docker-compose.yml"
    log_info "Si usas Docker manualmente, ejecuta: docker compose up -d"
fi

# Paso 7: Limpiar imágenes Docker no usadas (opcional)
echo ""
echo "------------------------------------------"
log_info "Paso 7/7: Limpiando imágenes Docker no usadas..."
echo "------------------------------------------"

docker image prune -f

log_info "✅ Limpieza completada"

# Finalización exitosa
echo ""
echo "=========================================="
log_info "¡Despliegue completado exitosamente!"
echo "=========================================="
echo ""
echo "Para verificar que el servicio está corriendo:"
echo "  - Docker: docker compose logs -f"
echo "  - Sin Docker: tail -f logs/app.log (si configuras logging)"
echo ""
echo "El servicio estará disponible en el puerto 3000 (HTTP) y 3001 (WebSocket)"
echo ""
echo "Para monitorear el modelo de autocompletado:"
echo "  Busca en los logs: '[Autocomplete] Model loaded'"
echo ""
