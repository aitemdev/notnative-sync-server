-- Buscar las notas que el cliente menciona como faltantes
SELECT 
  uuid, 
  name, 
  folder, 
  path,
  LENGTH(content) as content_length,
  deleted_at IS NULL as is_active,
  created_at,
  updated_at
FROM notes 
WHERE name LIKE '%Tareas para hoy%' 
   OR name LIKE '%Tareas Notnative%'
   OR uuid IN ('146a916b-6460-4dad-babd-6840e67d5f19', '1dfd97dc-5b3a-4706-a2d2-f235c0436e8c')
ORDER BY updated_at DESC;
