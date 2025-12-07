// Safe logging utility that handles EPIPE errors gracefully
// This prevents crashes when stdout/stderr is closed unexpectedly

const safeWrite = (fn: (...args: unknown[]) => void) => {
  return (...args: unknown[]) => {
    try {
      fn(...args);
    } catch (error) {
      // Ignore EPIPE errors - they occur when the output stream is closed
      if (error instanceof Error && error.message.includes('EPIPE')) {
        return;
      }
      // Re-throw other errors
      throw error;
    }
  };
};

export const log = {
  info: safeWrite(console.log.bind(console)),
  warn: safeWrite(console.warn.bind(console)),
  error: safeWrite(console.error.bind(console)),
  debug: safeWrite(console.debug.bind(console)),
};

// Handle uncaught EPIPE errors at process level
process.stdout?.on?.('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

process.stderr?.on?.('error', (err) => {
  if (err.code === 'EPIPE') return;
  throw err;
});

export default log;
