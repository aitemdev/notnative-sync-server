#!/bin/bash

# Script para diagnosticar problemas de descarga de modelos
# Usage: ./diagnose-model.sh

echo "=========================================="
echo "  Diagnóstico: Descarga de Modelos"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

# 1. Verificar si Docker está corriendo
echo "1. Verificando contenedores Docker..."
echo "------------------------------------------"
docker ps | grep notnative-server
if [ $? -eq 0 ]; then
    log_info "✅ Contenedor notnative-server está corriendo"
else
    log_error "❌ Contenedor notnative-server no está corriendo"
    exit 1
fi

# 2. Verificar acceso a internet desde el host
echo ""
echo "2. Verificando acceso a internet (host)..."
echo "------------------------------------------"
curl -I -s https://huggingface.co > /dev/null
if [ $? -eq 0 ]; then
    log_info "✅ Host puede acceder a huggingface.co"
else
    log_error "❌ Host NO puede acceder a huggingface.co"
    echo "   Revisa tu firewall o configuración de red"
fi

# 3. Verificar acceso a internet desde el contenedor
echo ""
echo "3. Verificando acceso a internet (contenedor)..."
echo "------------------------------------------"
docker exec notnative-server curl -I -s https://huggingface.co > /dev/null 2>&1
if [ $? -eq 0 ]; then
    log_info "✅ Contenedor puede acceder a huggingface.co"
else
    log_error "❌ Contenedor NO puede acceder a huggingface.co"
    echo "   Posibles causas:"
    echo "   - Docker sin acceso a red (comprueba: docker run --rm alpine wget -q -O - https://huggingface.co)"
    echo "   - Firewall bloqueando conexiones desde contenedores"
    echo "   - DNS no funciona en el contenedor"
    echo ""
    echo "   Soluciones:"
    echo "   1. Asegurar que el contenedor tenga red:"
    echo "      docker compose down && docker compose up -d"
    echo "   2. Usar modo bridge (en docker-compose.yml):"
    echo "      networks:"
    echo "        - default"
    echo "   3. Verificar firewall"
    exit 1
fi

# 4. Verificar directorio de modelos
echo ""
echo "4. Verificando directorio de modelos..."
echo "------------------------------------------"
docker exec notnative-server ls -la /app/models 2>&1
if [ $? -eq 0 ]; then
    log_info "✅ Directorio /app/models existe"
else
    log_warn "⚠️ Directorio /app/models NO existe (se creará automáticamente)"
fi

# 5. Verificar espacio en disco
echo ""
echo "5. Verificando espacio en disco..."
echo "------------------------------------------"
df -h / | awk '{print "  Espacio: " $4 "disponible de " $2}'

# 6. Verificar logs del servicio
echo ""
echo "6. Últimos logs del servicio..."
echo "------------------------------------------"
docker compose logs --tail=20 notnative-server

# 7. Recomendaciones
echo ""
echo "=========================================="
echo "  Recomendaciones"
echo "=========================================="
echo ""
log_info "Si todo está correcto, ejecuta:"
echo "   ./deploy-docker.sh"
echo ""
log_warn "Si hay errores de red:"
echo "   1. Reiniciar el contenedor:"
echo "      docker compose restart"
echo "   2. Verificar firewall:"
echo "      sudo ufw status  # o tu firewall"
echo "   3. Verificar configuración de Docker:"
echo "      cat docker-compose.yml"
echo ""
