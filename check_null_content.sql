-- Verificar notas con contenido NULL
SELECT uuid, name, folder, content IS NULL as is_null, LENGTH(content) as content_length, deleted_at IS NULL as is_active
FROM notes 
WHERE content IS NULL 
ORDER BY updated_at DESC 
LIMIT 20;
