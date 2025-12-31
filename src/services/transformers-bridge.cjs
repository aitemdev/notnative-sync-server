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
      transformers.env.allowLocalModels = false;
      transformers.env.useBrowserCache = false;
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
