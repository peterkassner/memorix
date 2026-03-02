/**
 * Embedding Provider — Abstraction Layer
 *
 * Extensible embedding interface. **Disabled by default** to minimize resource usage.
 *
 * Environment variable MEMORIX_EMBEDDING controls which provider to use:
 *   - MEMORIX_EMBEDDING=off (default) → no embedding, BM25 fulltext search only (~50MB RAM)
 *   - MEMORIX_EMBEDDING=fastembed     → local ONNX inference (384-dim bge-small, ~300MB RAM)
 *   - MEMORIX_EMBEDDING=transformers  → pure JS WASM inference (384-dim MiniLM, ~500MB RAM)
 *   - MEMORIX_EMBEDDING=auto          → try fastembed → transformers → off (legacy behavior)
 *
 * Resource impact of local embedding:
 *   - First load: 90%+ CPU for 5-30 seconds (model initialization)
 *   - Steady state: 300-500MB RAM (model in memory)
 *   - Per-query: 10-50ms CPU (embedding generation)
 *
 * Most users don't need vector search — BM25 fulltext is sufficient for keyword matching.
 * Vector search is useful for semantic similarity (e.g., "auth" matches "authentication").
 *
 * Architecture inspired by Mem0's multi-provider embedding design.
 */

export interface EmbeddingProvider {
  /** Provider name for logging/cache keys */
  readonly name: string;
  /** Vector dimensions (e.g., 384 for bge-small) */
  readonly dimensions: number;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** Singleton provider instance (null = not available) */
let provider: EmbeddingProvider | null = null;
let initPromise: Promise<EmbeddingProvider | null> | null = null;

/**
 * Get configured embedding mode from environment.
 * Default is 'off' to minimize resource usage.
 */
function getEmbeddingMode(): 'off' | 'fastembed' | 'transformers' | 'auto' {
  const env = process.env.MEMORIX_EMBEDDING?.toLowerCase()?.trim();
  if (env === 'fastembed' || env === 'transformers' || env === 'auto') {
    return env;
  }
  // Default: OFF — user must explicitly enable embedding
  return 'off';
}

/**
 * Get the embedding provider. Returns null if disabled or unavailable.
 * Lazy-initialized on first call. Concurrent callers share the same Promise.
 *
 * Controlled by MEMORIX_EMBEDDING environment variable (default: off).
 */
export async function getEmbeddingProvider(): Promise<EmbeddingProvider | null> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mode = getEmbeddingMode();

    // Explicit OFF — skip all embedding initialization
    if (mode === 'off') {
      console.error('[memorix] Embedding disabled (MEMORIX_EMBEDDING=off) — using BM25 fulltext search');
      return null;
    }

    // Explicit fastembed
    if (mode === 'fastembed') {
      try {
        const { FastEmbedProvider } = await import('./fastembed-provider.js');
        provider = await FastEmbedProvider.create();
        console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
        return provider;
      } catch (e) {
        console.error(`[memorix] Failed to load fastembed: ${e instanceof Error ? e.message : e}`);
        console.error('[memorix] Install with: npm install fastembed');
        return null;
      }
    }

    // Explicit transformers
    if (mode === 'transformers') {
      try {
        const { TransformersProvider } = await import('./transformers-provider.js');
        provider = await TransformersProvider.create();
        console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
        return provider;
      } catch (e) {
        console.error(`[memorix] Failed to load transformers: ${e instanceof Error ? e.message : e}`);
        console.error('[memorix] Install with: npm install @huggingface/transformers');
        return null;
      }
    }

    // Auto mode: try fastembed → transformers → off (legacy behavior)
    try {
      const { FastEmbedProvider } = await import('./fastembed-provider.js');
      provider = await FastEmbedProvider.create();
      console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
      return provider;
    } catch {
      // fastembed not installed — try next
    }

    try {
      const { TransformersProvider } = await import('./transformers-provider.js');
      provider = await TransformersProvider.create();
      console.error(`[memorix] Embedding provider: ${provider!.name} (${provider!.dimensions}d)`);
      return provider;
    } catch {
      // transformers not installed — degrade to fulltext
    }

    console.error('[memorix] No embedding provider available — using BM25 fulltext search');
    return null;
  })();

  return initPromise;
}

/**
 * Check if vector search is available.
 */
export async function isVectorSearchAvailable(): Promise<boolean> {
  const p = await getEmbeddingProvider();
  return p !== null;
}

/**
 * Reset provider (for testing).
 */
export function resetProvider(): void {
  provider = null;
  initPromise = null;
}
