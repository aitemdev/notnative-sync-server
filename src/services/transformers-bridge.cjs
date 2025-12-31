// Bridge para importar @xenova/transformers (ESM) en CommonJS
// Este archivo es .cjs y usa require() para node_modules y import() dinámico para ESM

let transformersModule = null;

async function loadTransformers() {
  if (transformersModule) {
    return transformersModule;
  }

  try {
    // Usar import() dinámico para módulos ESM
    const transformers = await import('@xenova/transformers');
    transformersModule = transformers;

    // Configurar entorno
    if (transformers.env) {
      // Permitir modelos locales descargados
      transformers.env.allowLocalModels = true;
      // Usar cache local para no depender de browser
      transformers.env.useBrowserCache = false;
      // Directorio de cache local (dentro del contenedor)
      transformers.env.localModelsPath = '/app/models';
      // Permitir modelos remotos si no están localmente
      transformers.env.allowRemoteModels = true;
      // HuggingFace token opcional (si está configurado)
      if (process.env.HF_TOKEN) {
        transformers.env.useCustomFetch = true;
      }
    }

    console.log('[TransformersBridge] Module loaded successfully');
    return transformersModule;
  } catch (error) {
    console.error('[TransformersBridge] Failed to load module:', error);
    throw error;
  }
}

module.exports = {
  loadTransformers
};
