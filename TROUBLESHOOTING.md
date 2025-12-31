# Troubleshooting: Error "Unauthorized access to file"

Si ves este error al iniciar el servicio:

```
[Autocomplete] Failed to load model: Error: Unauthorized access to file: "https://huggingface.co/Xenova/TinyLlama-1.1B-chat/resolve/main/tokenizer.json"
```

## Causas Posibles

### 1. El contenedor no tiene acceso a internet
El modelo se descarga automáticamente desde HuggingFace la primera vez. Si el contenedor no puede conectarse a internet, fallará.

**Solución:**
```bash
# Verificar que el contenedor tenga acceso a internet
docker exec notnative-server curl -I https://huggingface.co
```

Si no responde, revisa tu configuración de Docker:

**Docker Compose:**
```yaml
services:
  notnative-server:
    # ... otras opciones
    networks:
      - default
```

**Docker Run:**
```bash
docker run --network=host ...
```

### 2. Firewall bloqueando HuggingFace
Algunos firewalls o proxies pueden bloquear el acceso a huggingface.co.

**Solución:**
Asegurar que el puerto 443 (HTTPS) está abierto para conexiones salientes.

### 3. Permisos de directorio
El modelo necesita guardar archivos en `/app/models`.

**Solución:**
El Dockerfile ya crea el directorio y asigna permisos:
```dockerfile
RUN mkdir -p /app/models && chown -R node:node /app/models
```

### 4. Modelo ya descargado pero corrupto
Si el modelo se descargó parcialmente, puede estar corrupto.

**Solución:**
```bash
# Eliminar el directorio de modelos para forzar nueva descarga
docker exec notnative-server rm -rf /app/models/*
docker compose restart
```

## Solución Rápida: Descargar el modelo fuera del contenedor

Si el contenedor no puede descargar el modelo, puedes descargarlo manualmente y copiarlo:

```bash
# En tu VPS (fuera del contenedor)
cd ~/notnative-sync-server
mkdir -p models

# Crear script para descargar
cat > download-model.js << 'EOF'
const { pipeline, env } = require('@xenova/transformers');

env.localModelsPath = './models';
env.allowRemoteModels = true;

async function download() {
  console.log('Descargando modelo...');
  const generator = await pipeline('text-generation', 'Xenova/TinyLlama-1.1B-chat', {
    quantized: true
  });
  console.log('Modelo descargado exitosamente');
}

download().catch(console.error);
EOF

# Instalar dependencias (solo la primera vez)
npm install @xenova/transformers

# Descargar el modelo
node download-model.js

# Copiar al volumen de Docker (ajusta la ruta según tu configuración)
# Ejemplo: si tienes un volumen montado en /app/models
# cp -r models/* /path/to/docker/volume/models/

# O reiniciar el contenedor para que lo use
docker compose restart
```

## Verificar Logs

Para ver el progreso de la descarga:

```bash
docker compose logs -f
```

Deberías ver algo como:
```
[TransformersBridge] Module loaded successfully
[Autocomplete] Transformers loaded successfully
[Autocomplete] Loading model: Xenova/TinyLlama-1.1B-chat...
[Autocomplete] Loading: 20%
[Autocomplete] Loading: 40%
[Autocomplete] Model loaded in 45231ms
[Autocomplete] Model ready for inference
```

## Solución Alternativa: Descargar con caché pre-built

Si sigues teniendo problemas, puedes usar un modelo con caché pre-built:

```bash
# Agregar a .env
HF_TOKEN=your_token_here  # Opcional, para modelos privados
```

## Documentación Oficial

Más información: https://huggingface.co/docs/hub/transformers-js
