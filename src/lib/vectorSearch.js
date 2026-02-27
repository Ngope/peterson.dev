/**
 * Vector search utilities for RAG pipeline
 * Performs cosine similarity search over embeddings
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use WASM backend (works in serverless)
env.backends.onnx.wasm.numThreads = 1;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const EMBEDDINGS_PATH = path.join(projectRoot, 'data', 'embeddings.json');
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

// Cache for loaded embeddings and model
let embeddingsCache = null;
let embedderCache = null;

/**
 * Load embeddings from JSON file
 */
export function loadEmbeddings() {
  if (embeddingsCache) {
    return embeddingsCache;
  }

  if (!fs.existsSync(EMBEDDINGS_PATH)) {
    throw new Error(`Embeddings file not found: ${EMBEDDINGS_PATH}`);
  }

  const data = fs.readFileSync(EMBEDDINGS_PATH, 'utf-8');
  embeddingsCache = JSON.parse(data);

  console.log(`✓ Loaded ${embeddingsCache.chunks.length} embeddings`);
  return embeddingsCache;
}

/**
 * Get or initialize embedding model
 */
export async function getEmbedder() {
  if (embedderCache) {
    return embedderCache;
  }

  console.log('Loading embedding model...');
  embedderCache = await pipeline('feature-extraction', EMBEDDING_MODEL);
  console.log('✓ Embedding model loaded');

  return embedderCache;
}

/**
 * Generate embedding for a query
 *
 * @param {string} text - Text to embed
 * @returns {Promise<Array<number>>} Embedding vector
 */
export async function generateQueryEmbedding(text) {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Calculate cosine similarity between two vectors
 *
 * @param {Array<number>} vecA - First vector
 * @param {Array<number>} vecB - Second vector
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Search for top-K most similar chunks
 *
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {Object} options - Search options
 * @param {number} options.k - Number of results to return (default: 5)
 * @param {number} options.threshold - Minimum similarity score (default: 0.7)
 * @param {string} options.type - Filter by metadata type (optional)
 * @returns {Array<Object>} Top-K relevant chunks with scores
 */
export function searchTopK(queryEmbedding, options = {}) {
  const {
    k = 5,
    threshold = 0.7,
    type = null
  } = options;

  const embeddings = loadEmbeddings();
  const results = [];

  // Calculate similarity for each chunk
  for (const chunk of embeddings.chunks) {
    // Apply type filter if specified
    if (type && chunk.metadata.type !== type) {
      continue;
    }

    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);

    // Only include if above threshold
    if (similarity >= threshold) {
      results.push({
        id: chunk.id,
        content: chunk.content,
        source: chunk.source,
        section: chunk.section,
        metadata: chunk.metadata,
        similarity: similarity
      });
    }
  }

  // Sort by similarity (highest first) and return top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, k);
}

/**
 * Search by text query (convenience function)
 *
 * @param {string} query - Text query
 * @param {Object} options - Search options (same as searchTopK)
 * @returns {Promise<Array<Object>>} Top-K relevant chunks
 */
export async function search(query, options = {}) {
  const queryEmbedding = await generateQueryEmbedding(query);
  return searchTopK(queryEmbedding, options);
}

/**
 * Get chunk by ID
 *
 * @param {string} chunkId - Chunk ID
 * @returns {Object|null} Chunk object or null if not found
 */
export function getChunkById(chunkId) {
  const embeddings = loadEmbeddings();
  return embeddings.chunks.find(chunk => chunk.id === chunkId) || null;
}

/**
 * Get statistics about embeddings
 */
export function getEmbeddingsStats() {
  const embeddings = loadEmbeddings();

  const typeCount = {};
  for (const chunk of embeddings.chunks) {
    const type = chunk.metadata.type;
    typeCount[type] = (typeCount[type] || 0) + 1;
  }

  return {
    totalChunks: embeddings.chunks.length,
    dimension: embeddings.metadata.dimension,
    model: embeddings.metadata.model,
    generatedAt: embeddings.metadata.generatedAt,
    typeBreakdown: typeCount
  };
}
