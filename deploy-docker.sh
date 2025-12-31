#!/bin/bash

# NotNative VPS Server - Docker Deployment Script
# Usage: ./deploy-docker.sh
# Este script gestiona el ciclo de vida completo del despliegue con Docker

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

echo "🐳 Iniciando despliegue de NotNative VPS Server (Docker)..."
echo "=========================================="
echo ""

# Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    log_error "No se encontró package.json. Por favor ejecuta este script desde el directorio vps-server/"
    exit 1
fi

# Verificar si docker compose está disponible
if ! command -v docker &> /dev/null; then
    log_error "Docker no está disponible. Por favor instálalo primero."
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

# Paso 1: Actualizar código desde repositorio
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

# Paso 2: Preparar directorios persistentes
echo ""
echo "------------------------------------------"
log_info "Paso 2/5: Preparando directorios persistentes..."
echo "------------------------------------------"

# Crear directorio de modelos si no existe
if [ ! -d "models" ]; then
    log_warn "Directorio 'models' no existe. Creándolo..."
    mkdir -p models
fi

# Asegurar permisos para que el contenedor (usuario node) pueda escribir
# Esto es crucial para que el contenedor pueda guardar los modelos descargados
chmod 777 models

log_info "✅ Directorio models verificado y permisos ajustados"

# Paso 3: Parar contenedores existentes
echo ""
echo "------------------------------------------"
log_info "Paso 3/5: Parando contenedores existentes..."
echo "------------------------------------------"

docker compose down

if [ $? -ne 0 ]; then
    log_warn "Advertencia: docker compose down falló, pero continuando..."
fi

log_info "✅ Contenedores parados"

# Paso 4: Reconstruir imágenes Docker
echo ""
echo "------------------------------------------"
log_info "Paso 4/5: Reconstruyendo imágenes Docker..."
echo "------------------------------------------"
log_warn "Nota: npm install y npm run build se ejecutarán DENTRO del contenedor"

docker compose build --no-cache

if [ $? -ne 0 ]; then
    log_error "Falló la construcción del contenedor Docker"
    log_error "Verifica los logs anteriores para más detalles"
    exit 1
fi

log_info "✅ Contenedor Docker reconstruido exitosamente"

# Paso 5: Iniciar servicios
echo ""
echo "------------------------------------------"
log_info "Paso 5/5: Iniciando servicios..."
echo "------------------------------------------"

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

# Limpiar imágenes Docker no usadas
echo ""
echo "------------------------------------------"
log_info "Limpiando imágenes Docker no usadas..."
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
echo "  - docker compose logs -f"
echo ""
echo "El servicio estará disponible en:"
echo "  - HTTP: http://localhost:3000"
echo "  - WebSocket: ws://localhost:3001"
echo ""
echo "Para monitorear el modelo de autocompletado:"
echo "  Busca en los logs: '[Autocomplete]'"
echo ""
