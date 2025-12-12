# Cambios en el Sistema de Sincronización - Guía para Clientes

## 📋 Resumen de Cambios

El sistema de sincronización ha sido **simplificado** para usar **HTTP REST como único mecanismo de sincronización**, mientras que **WebSocket solo envía notificaciones** para disparar el sync en tiempo real cuando ambos clientes están conectados.

### ¿Por qué este cambio?

**Antes**: Teníamos DOS sistemas de sincronización funcionando simultáneamente (HTTP REST + WebSocket), lo que causaba:
- ❌ Duplicación de notas
- ❌ Conflictos entre timestamps
- ❌ Complejidad innecesaria
- ❌ Bugs difíciles de rastrear

**Ahora**: 
- ✅ **Una sola fuente de verdad**: HTTP REST con `sync_log`
- ✅ **WebSocket solo para notificaciones**: Dispara sync inmediato cuando hay otros clientes conectados
- ✅ **Funciona offline**: Los cambios se sincronizan cuando hay conexión
- ✅ **Sin duplicación**: Cada cambio se guarda una sola vez
- ✅ **Más simple y confiable**

---

## 🔄 Flujo de Sincronización Nuevo

### Escenario 1: Ambos clientes conectados (Sync en tiempo real)

```
Cliente A (Web)                  Servidor                    Cliente B (VS Code)
     │                              │                              │
     │  1. POST /api/sync/push      │                              │
     ├─────────────────────────────>│                              │
     │     (envía cambios)           │                              │
     │                              │                              │
     │  2. Guarda en DB + sync_log  │                              │
     │                              │                              │
     │  3. HTTP 200 OK              │                              │
     │<─────────────────────────────┤                              │
     │                              │                              │
     │                              │  4. WS: sync:notify          │
     │                              ├─────────────────────────────>│
     │                              │     (notificación)            │
     │                              │                              │
     │                              │  5. GET /api/sync/changes    │
     │                              │<─────────────────────────────┤
     │                              │     (pull inmediato)          │
     │                              │                              │
     │                              │  6. HTTP 200 + cambios       │
     │                              ├─────────────────────────────>│
     │                              │                              │
     │                              │  7. Aplica cambios           │
     │                              │                              │
```

### Escenario 2: Cliente B desconectado (Sync diferido)

```
Cliente A (Web)                  Servidor                    Cliente B (VS Code)
     │                              │                              
     │  1. POST /api/sync/push      │                              
     ├─────────────────────────────>│                              
     │     (envía cambios)           │                              
     │                              │                              
     │  2. Guarda en DB + sync_log  │                              
     │                              │                              
     │  3. HTTP 200 OK              │                              
     │<─────────────────────────────┤                              
     │                              │                              
     │                              │  (Cliente B desconectado)
     │                              │                              
     │                              │                              
     │                              │  --- Tiempo después ---
     │                              │                              
     │                              │  4. Cliente B se conecta
     │                              │                              
     │                              │  5. GET /api/sync/changes    
     │                              │<─────────────────────────────┤
     │                              │     (pull periódico)          
     │                              │                              
     │                              │  6. HTTP 200 + cambios       
     │                              │     (recupera todo pendiente) 
     │                              ├─────────────────────────────>│
     │                              │                              
     │                              │  7. Aplica cambios           
     │                              │                              
```

---

## 📎 Sincronización de Archivos Adjuntos

**SÍ, el sistema HTTP REST sincroniza archivos adjuntos e imágenes**, pero funciona en dos pasos:

### Flujo de Sincronización de Attachments

1. **Subir archivo** (Cliente A):
   ```typescript
   // POST /api/attachments/upload
   const formData = new FormData();
   formData.append('file', file);
   formData.append('noteUuid', noteUuid);
   
   const response = await fetch('/api/attachments/upload', {
     method: 'POST',
     headers: { 'Authorization': `Bearer ${token}` },
     body: formData
   });
   
   const { attachment } = await response.json();
   // attachment contiene: { id, noteUuid, fileName, fileHash, fileSize, mimeType }
   ```

2. **Sincronizar metadata** (automático en `/api/sync/changes`):
   - El endpoint `/api/sync/changes` devuelve metadata de attachments
   - Cliente B recibe: `{ entityType: 'attachment', operation: 'create', dataJson: {...} }`

3. **Descargar archivo** (Cliente B):
   ```typescript
   // GET /api/sync/attachment/:id/download
   const response = await fetch(`/api/sync/attachment/${attachmentId}/download`, {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   
   const blob = await response.blob();
   // Guardar archivo localmente
   ```

### Ejemplo Completo

```typescript
async function applyChange(change: Change) {
  if (change.entityType === 'note') {
    await saveNoteLocally(change.dataJson);
  } 
  else if (change.entityType === 'attachment') {
    if (change.operation === 'create') {
      // 1. Guardar metadata
      await saveAttachmentMetadata(change.dataJson);
      
      // 2. Descargar archivo real
      const response = await fetch(
        `/api/sync/attachment/${change.dataJson.id}/download`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      const blob = await response.blob();
      
      // 3. Guardar archivo localmente
      await saveAttachmentFile(change.dataJson.id, blob);
      
      console.log(`📎 Downloaded attachment: ${change.dataJson.fileName}`);
    }
    else if (change.operation === 'delete') {
      await deleteAttachmentLocally(change.dataJson.id);
    }
  }
}
```

### ⚠️ IMPORTANTE: Evitar Loop Infinito

**NO hagas push de cambios que recibiste del servidor en un pull**. Ejemplo de lo que NO hacer:

```typescript
// ❌ MAL - Causa loop infinito
async function performSyncPull() {
  const { changes } = await fetch('/api/sync/changes?since=...').then(r => r.json());
  
  for (const change of changes) {
    await saveNoteLocally(change.dataJson);
    
    // ❌ NUNCA HAGAS ESTO: Re-encolar para push
    await enqueueSyncChange(change); // ¡Loop infinito!
  }
}
```

**Solución correcta:**

```typescript
// ✅ BIEN - Solo guarda localmente, NO hace push
async function performSyncPull() {
  const { changes } = await fetch('/api/sync/changes?since=...').then(r => r.json());
  
  for (const change of changes) {
    // Solo guardar localmente, NO encolar para push
    await saveNoteLocally(change.dataJson);
    
    // Actualizar timestamp local para no volver a enviar
    await updateLocalTimestamp(change.entityId, change.timestamp);
  }
}

// ✅ Solo hacer push de cambios originados localmente
async function onNoteChangedByUser(note: Note) {
  const change = {
    ...note,
    timestamp: Date.now(), // Timestamp NUEVO
    deviceId: getDeviceId(),
    synced: false,
  };
  
  await enqueueSyncChange(change);
  await performSyncPush([change]);
}
```

### Verificar timestamps antes de enviar

```typescript
async function getPendingChanges(): Promise<Change[]> {
  const allChanges = await getAllLocalChanges();
  
  // Filtrar cambios que ya están sincronizados
  const pending = allChanges.filter(change => {
    const serverTimestamp = getLastServerTimestamp(change.entityId);
    
    // Solo enviar si nuestro timestamp es más reciente
    return !change.synced && change.timestamp > serverTimestamp;
  });
  
  return pending;
}
```

### Importante

- **La metadata se sincroniza automáticamente** vía `/api/sync/changes`
- **Los archivos se descargan bajo demanda** vía `/api/sync/attachment/:id/download`
- El servidor verifica permisos y hash del archivo
- Se hace streaming para archivos grandes

---

## 🛠️ Cambios Requeridos en el Cliente

### 1. **Eliminar envío de datos por WebSocket**

**❌ ANTES** (Enviar cambios por WS):
```typescript
// NO hacer esto más
ws.send(JSON.stringify({
  type: 'sync:push',
  data: changes
}));
```

**✅ AHORA** (Solo usar HTTP):
```typescript
// Enviar cambios SOLO por HTTP REST
await fetch('/api/sync/push', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ changes })
});
```

---

### 2. **Actualizar manejo de mensajes WebSocket**

El WebSocket ahora **solo envía notificaciones**, no datos.

**❌ ANTES** (Recibir datos por WS):
```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'sync:push') {
    // Aplicar cambios recibidos
    applyChanges(message.data.changes);
  }
};
```

**✅ AHORA** (Recibir notificación y hacer pull):
```typescript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'sync:notify':
      // ¡Hay cambios disponibles! Hacer pull inmediatamente
      console.log('🔔 Sync notification received from device:', message.data.sourceDeviceId);
      await performSyncPull(); // <-- Esto hace GET /api/sync/changes
      break;
      
    case 'heartbeat':
      console.log('💓 Heartbeat from server');
      break;
      
    case 'pong':
      // Respuesta a ping
      break;
  }
};
```

---

### 3. **Implementar función de Pull HTTP**

Esta función debe ejecutarse cuando:
1. Se recibe notificación `sync:notify` por WebSocket
2. Periódicamente cada X segundos (ej: 30-60s) como fallback
3. Al conectarse/reconectarse la aplicación

```typescript
async function performSyncPull() {
  try {
    const lastSyncTimestamp = getLastSyncTimestamp(); // De tu storage local
    
    const response = await fetch(
      `/api/sync/changes?since=${lastSyncTimestamp}&deviceId=${deviceId}&limit=1000`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );
    
    const { changes, hasMore, lastTimestamp } = await response.json();
    
    if (changes.length > 0) {
      console.log(`📥 Received ${changes.length} changes from server`);
      
      // Aplicar cambios localmente
      for (const change of changes) {
        await applyChange(change); // Maneja notas Y attachments
      }
      
      // Guardar último timestamp sincronizado
      setLastSyncTimestamp(lastTimestamp);
    }
    
    // Si hay más cambios, hacer otra petición
    if (hasMore) {
      await performSyncPull();
    }
    
  } catch (error) {
    console.error('❌ Error pulling changes:', error);
  }
}
```

---

### 4. **Función para Push de cambios locales**

```typescript
async function performSyncPush(localChanges: Change[]) {
  try {
    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changes: localChanges.map(change => ({
          entityType: 'note', // o 'attachment'
          entityId: change.uuid,
          operation: change.operation, // 'create', 'update', 'delete'
          dataJson: change.data,
          timestamp: change.timestamp,
          deviceId: deviceId,
        }))
      }),
    });
    
    const { applied, conflicts, conflictDetails } = await response.json();
    
    console.log(`✅ Push completed - Applied: ${applied}, Conflicts: ${conflicts}`);
    
    // Manejar conflictos si los hay
    if (conflicts > 0) {
      handleConflicts(conflictDetails);
    }
    
    // Marcar cambios como sincronizados
    markChangesSynced(localChanges);
    
  } catch (error) {
    console.error('❌ Error pushing changes:', error);
    // Los cambios quedan en cola para reintentarse después
  }
}
```

---

### 5. **Estrategia de Sincronización Completa**

```typescript
class SyncManager {
  private ws: WebSocket | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing = false;
  
  async start() {
    // 1. Conectar WebSocket para notificaciones
    this.connectWebSocket();
    
    // 2. Hacer sync inicial
    await this.performFullSync();
    
    // 3. Iniciar polling periódico (fallback)
    this.syncInterval = setInterval(() => {
      this.performSyncPull();
    }, 60000); // Cada 60 segundos
  }
  
  connectWebSocket() {
    const token = getAuthToken();
    const deviceId = getDeviceId();
    
    this.ws = new WebSocket(
      `ws://localhost:3001?token=${token}&deviceId=${deviceId}`
    );
    
    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'sync:notify') {
        console.log('🔔 Sync notification received');
        // Hacer pull inmediato
        this.performSyncPull();
      }
    };
    
    this.ws.onclose = () => {
      console.log('❌ WebSocket disconnected - reconnecting...');
      setTimeout(() => this.connectWebSocket(), 5000);
    };
    
    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
    
    // Enviar heartbeat cada 30s
    setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 30000);
  }
  
  async performFullSync() {
    if (this.isSyncing) return;
    
    this.isSyncing = true;
    
    try {
      // 1. Push cambios locales pendientes
      const pendingChanges = await getPendingChanges();
      if (pendingChanges.length > 0) {
        await this.performSyncPush(pendingChanges);
      }
      
      // 2. Pull cambios del servidor
      await this.performSyncPull();
      
    } finally {
      this.isSyncing = false;
    }
  }
  
  async performSyncPush(changes: Change[]) {
    // Ver código anterior
  }
  
  async performSyncPull() {
    // Ver código anterior
  }
  
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

---

## 📊 Estructura del mensaje WebSocket

### Mensaje de Notificación (`sync:notify`)

```typescript
{
  type: 'sync:notify',
  data: {
    timestamp: 1702389421000,        // Timestamp del servidor
    sourceDeviceId: 'web-abc123',    // Dispositivo que envió los cambios
    changesCount: 5,                  // Número de cambios disponibles
    hasNotes: true,                   // Si hay cambios en notas
    hasAttachments: false             // Si hay cambios en attachments
  }
}
```

### Mensaje de Heartbeat

```typescript
// Enviar al servidor cada 30s
{
  type: 'heartbeat'
}

// Respuesta del servidor
{
  type: 'pong',
  data: {
    timestamp: 1702389421000
  }
}
```

---

## 🔍 Detección de Cambios Locales

Cuando el usuario hace cambios localmente, debes encolarlos para sincronización:

```typescript
// Cuando se crea/edita una nota
async function onNoteChanged(note: Note, operation: 'create' | 'update' | 'delete') {
  // 1. Guardar cambio en DB local
  await saveNoteLocally(note);
  
  // 2. Encolar para sincronización
  const change: Change = {
    entityType: 'note',
    entityId: note.uuid,
    operation: operation,
    dataJson: note,
    timestamp: Date.now(),
    deviceId: getDeviceId(),
    synced: false,
  };
  
  await enqueueSyncChange(change);
  
  // 3. Intentar sincronizar inmediatamente (si hay conexión)
  syncManager.performSyncPush([change]);
}

// Cuando se sube un attachment
async function onAttachmentUploaded(file: File, noteUuid: string) {
  // 1. Subir archivo al servidor
  const formData = new FormData();
  formData.append('file', file);
  formData.append('noteUuid', noteUuid);
  
  const response = await fetch('/api/attachments/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData
  });
  
  const { attachment } = await response.json();
  
  // 2. Encolar metadata para sincronización
  const change: Change = {
    entityType: 'attachment',
    entityId: attachment.id,
    operation: 'create',
    dataJson: attachment,
    timestamp: Date.now(),
    deviceId: getDeviceId(),
    synced: false,
  };
  
  await enqueueSyncChange(change);
  
  // 3. Sincronizar inmediatamente
  syncManager.performSyncPush([change]);
}
```

---

## ⚠️ Manejo de Conflictos

El servidor detecta conflictos cuando:
- El timestamp del servidor es más reciente que el del cliente
- Dos dispositivos modificaron la misma nota

```typescript
interface Conflict {
  entityType: 'note' | 'attachment';
  entityId: string;
  localTimestamp: number;
  serverTimestamp: number;
  operation: 'create' | 'update' | 'delete';
}

async function handleConflicts(conflicts: Conflict[]) {
  for (const conflict of conflicts) {
    console.warn('⚠️ Conflict detected:', conflict);
    
    // Estrategia: El servidor siempre gana
    // Hacer pull para obtener la versión del servidor
    await performSyncPull();
    
    // Opcionalmente: Mostrar UI para que el usuario resuelva
    // showConflictResolutionDialog(conflict);
  }
}
```

---

## 📱 Sincronización en diferentes estados

### App en foreground
- WebSocket conectado ✅
- Notificaciones instantáneas ✅
- Polling cada 60s como fallback

### App en background
- WebSocket puede desconectarse
- Depender del polling periódico
- Sync completo al volver a foreground

### App offline
- Encolar cambios localmente
- Al recuperar conexión, hacer sync completo

```typescript
// Detectar cambio de conectividad
window.addEventListener('online', async () => {
  console.log('🌐 Connection restored - syncing...');
  await syncManager.performFullSync();
});

window.addEventListener('offline', () => {
  console.log('📴 Connection lost - changes will be queued');
});
```

---

## 🧪 Testing

### Probar sincronización entre dispositivos

1. **Abrir cliente A** (ej: VS Code)
2. **Abrir cliente B** (ej: Web)
3. **Crear nota en cliente A**
4. **Verificar**: Cliente B debe recibir notificación y mostrar la nota inmediatamente
5. **Desconectar cliente B**
6. **Editar nota en cliente A**
7. **Reconectar cliente B**
8. **Verificar**: Cliente B debe recuperar los cambios en el siguiente pull

---

## 📝 Checklist de Implementación

- [ ] Eliminar código que envía datos por WebSocket
- [ ] Implementar `performSyncPull()`
- [ ] Implementar `performSyncPush()`
- [ ] Actualizar handler de mensajes WebSocket para `sync:notify`
- [ ] Implementar polling periódico como fallback
- [ ] Implementar cola de cambios locales
- [ ] Manejar conflictos correctamente
- [ ] Implementar sync al conectar/reconectar
- [ ] Implementar sync al detectar cambio de red
- [ ] **Implementar descarga de attachments en `applyChange()`**
- [ ] **Implementar subida de attachments con `POST /api/attachments/upload`**
- [ ] Testing entre dispositivos

---

## 🎯 Beneficios del Nuevo Sistema

1. **Más simple**: Un solo sistema de sincronización (HTTP REST)
2. **Más confiable**: Sin duplicación de datos
3. **Funciona offline**: Los cambios se sincronizan cuando hay conexión
4. **Tiempo real cuando es posible**: WebSocket notifica para sync instantáneo
5. **Fallback robusto**: Polling periódico si WebSocket falla
6. **Escalable**: Fácil de entender, mantener y debuggear

---

## 📞 Soporte

Si tienes dudas sobre la implementación, revisa:
- `/src/routes/sync.ts` - Endpoints HTTP de sincronización
- `/src/websocket/server.ts` - Servidor WebSocket de notificaciones

¡Buena suerte con la implementación! 🚀
