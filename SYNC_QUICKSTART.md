# Guía Rápida de Sincronización

## 🚀 Inicio Rápido

### Paso 1: Configurar el Servidor VPS

1. **Navegar al directorio del servidor:**
   ```bash
   cd vps-server
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Crear archivo de configuración `.env`:**
   ```env
   DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/notnative_sync
   JWT_ACCESS_SECRET=clave_secreta_access_muy_larga_y_aleatoria_123
   JWT_REFRESH_SECRET=clave_secreta_refresh_muy_larga_y_aleatoria_456
   PORT=3000
   ```

4. **Crear base de datos PostgreSQL:**
   ```bash
   # Conectarse a PostgreSQL
   psql -U postgres

   # Crear base de datos
   CREATE DATABASE notnative_sync;
   ```

5. **Ejecutar migraciones:**
   ```bash
   npm run migrate
   ```

6. **Iniciar servidor:**
   ```bash
   npm run dev
   ```

   ✅ El servidor estará corriendo en `http://localhost:3000`

### Paso 2: Configurar la Aplicación Electron

1. **Iniciar la aplicación NotNative:**
   ```bash
   npm run dev
   ```

2. **Hacer clic en el indicador de sincronización** en la barra de estado (esquina inferior derecha).

3. **Registrar una nueva cuenta:**
   - Email: tu@email.com
   - Contraseña: tu_contraseña_segura
   - URL del servidor: http://localhost:3000
   - Hacer clic en "Create Account"

4. **¡Listo!** La sincronización automática comenzará cada 3 minutos.

## 🔄 Uso Diario

### Sincronización Automática
- Se ejecuta automáticamente cada **3 minutos**
- Si falla, el intervalo aumenta gradualmente (3min → 6min → 12min → 30min)
- Cuando la conexión se restablece, vuelve a 3 minutos

### Sincronización Manual
1. Hacer clic en el **icono de nube** en la barra de estado
2. O abrir Configuración > Sincronización > "Sincronizar ahora"

### Indicadores de Estado

| Icono | Estado | Descripción |
|-------|--------|-------------|
| ☁️ | Sincronizado | Todas las notas están sincronizadas |
| 🔄 | Sincronizando | Sincronización en progreso |
| ✅ | Completado | Sincronización exitosa reciente |
| ❌ | Error | Error de conexión o autenticación |
| ☁️❌ | Desconectado | No hay sesión activa |

## ⚙️ Configuración

### Ver Estado de Sincronización
1. Abrir Configuración (`Ctrl+,`)
2. Ir a la pestaña "Sincronización"
3. Ver:
   - Email de la cuenta
   - URL del servidor
   - Dispositivos conectados
   - Última sincronización

### Cerrar Sesión
1. Configuración > Sincronización
2. Hacer clic en "Cerrar sesión"

### Cambiar de Servidor
1. Cerrar sesión
2. Hacer clic en el indicador de sincronización
3. Ingresar nueva URL del servidor y credenciales

## 🔒 Seguridad

- **Contraseñas hasheadas** con bcrypt (12 rounds)
- **JWT tokens** con expiración (Access: 15min, Refresh: 7 días)
- **HTTPS recomendado** en producción
- **Rate limiting**: 100 requests/15min por IP
- **Tokens almacenados localmente** en SQLite cifrado

## 🐛 Solución de Problemas

### "Failed to connect to server"
- ✅ Verificar que el servidor VPS esté corriendo
- ✅ Verificar la URL del servidor (http://localhost:3000)
- ✅ Revisar logs del servidor: `vps-server/` terminal

### "401 Unauthorized"
- ✅ Cerrar sesión y volver a iniciar
- ✅ Verificar credenciales

### "Sync conflict detected"
- ✅ Abrir el panel de conflictos (aparece automáticamente)
- ✅ Elegir versión a conservar (local o remota)
- ✅ O fusionar cambios manualmente

### Sincronización muy lenta
- ✅ Verificar conexión a internet
- ✅ Revisar cantidad de notas (más de 1000 puede ser lento)
- ✅ Considerar aumentar intervalo de sincronización

## 📊 Monitoreo

### Logs del Cliente
- Ver consola de Electron (DevTools)
- Logs en: `AppData/Local/NotNative/logs/`

### Logs del Servidor
- Terminal donde se ejecuta `npm run dev`
- Logs en PostgreSQL: tabla `sync_log`

## 🌐 Despliegue en Producción

### Servidor VPS
1. **Configurar dominio y HTTPS:**
   ```bash
   # Usar Nginx como reverse proxy
   # Obtener certificado SSL con Let's Encrypt
   ```

2. **Variables de entorno de producción:**
   ```env
   DATABASE_URL=postgresql://user:pass@vps-ip:5432/notnative_sync
   JWT_ACCESS_SECRET=clave_super_secreta_generada_con_openssl
   JWT_REFRESH_SECRET=otra_clave_super_secreta_diferente
   PORT=3000
   NODE_ENV=production
   ```

3. **Iniciar con PM2:**
   ```bash
   npm install -g pm2
   npm run build
   pm2 start dist/index.js --name notnative-sync
   pm2 save
   ```

### Aplicación Cliente
- Cambiar URL del servidor a: `https://tu-dominio.com`
- Distribuir app con servidor preconfigurado

## 📝 Notas Técnicas

- **Base de datos local:** SQLite con WAL mode
- **Base de datos remota:** PostgreSQL
- **Método de sincronización:** Polling cada 3 minutos
- **Detección de conflictos:** Timestamp-based (last-write-wins por defecto)
- **UUID:** Generados en cliente con `crypto.randomUUID()`
- **Triggers SQLite:** Auto-logging de cambios INSERT/UPDATE/DELETE

## 🎯 Roadmap Futuro

- [ ] WebSocket para sincronización en tiempo real
- [ ] Encriptación end-to-end (E2EE)
- [ ] Resolución inteligente de conflictos
- [ ] Soporte para archivos adjuntos grandes (S3/MinIO)
- [ ] Sincronización selectiva (solo notas favoritas)
- [ ] Modo offline-first mejorado
- [ ] Dashboard web para gestión de dispositivos

---

**¿Necesitas ayuda?** Consulta el README completo en `vps-server/README.md` o abre un issue en GitHub.
