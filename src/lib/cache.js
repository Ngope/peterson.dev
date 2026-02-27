/**
 * Query caching system
 * Three-tier caching: exact match, semantic similarity, LRU eviction
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { cosineSimilarity } from './vectorSearch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const CACHE_PATH = path.join(projectRoot, 'data', 'cache.json');
const MAX_CACHE_SIZE = 100;
const SEMANTIC_SIMILARITY_THRESHOLD = 0.92;

// In-memory cache (loaded from file, persisted on write)
let cacheData = null;

/**
 * Load cache from disk
 */
function loadCache() {
  if (cacheData) {
    return cacheData;
  }

  if (fs.existsSync(CACHE_PATH)) {
    try {
      const data = fs.readFileSync(CACHE_PATH, 'utf-8');
      cacheData = JSON.parse(data);
      console.log(`✓ Loaded ${cacheData.queries.length} cached queries`);
    } catch (error) {
      console.error('Error loading cache:', error.message);
      cacheData = initializeCache();
    }
  } else {
    cacheData = initializeCache();
  }

  return cacheData;
}

/**
 * Initialize empty cache structure
 */
function initializeCache() {
  return {
    queries: [],
    metadata: {
      maxSize: MAX_CACHE_SIZE,
      similarityThreshold: SEMANTIC_SIMILARITY_THRESHOLD,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }
  };
}

/**
 * Save cache to disk
 */
function saveCache() {
  try {
    cacheData.metadata.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cacheData, null, 2));
  } catch (error) {
    console.error('Error saving cache:', error.message);
  }
}

/**
 * Normalize query text for exact matching
 */
function normalizeQuery(query) {
  return query.toLowerCase().trim();
}

/**
 * Check for exact match in cache
 *
 * @param {string} query - User query
 * @returns {Object|null} Cached response or null
 */
export function checkExactMatch(query) {
  const cache = loadCache();
  const normalized = normalizeQuery(query);

  const match = cache.queries.find(
    entry => normalizeQuery(entry.query) === normalized
  );

  if (match) {
    // Update hit count and timestamp
    match.hitCount++;
    match.lastHit = new Date().toISOString();
    saveCache();

    return {
      response: match.response,
      sources: match.sources,
      cached: true,
      cacheType: 'exact'
    };
  }

  return null;
}

/**
 * Check for semantic match in cache
 *
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @returns {Object|null} Cached response or null
 */
export function checkSemanticMatch(queryEmbedding) {
  const cache = loadCache();

  let bestMatch = null;
  let bestScore = 0;

  for (const entry of cache.queries) {
    if (!entry.queryEmbedding) {
      continue;
    }

    const similarity = cosineSimilarity(queryEmbedding, entry.queryEmbedding);

    if (similarity > bestScore && similarity >= SEMANTIC_SIMILARITY_THRESHOLD) {
      bestScore = similarity;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    // Update hit count and timestamp
    bestMatch.hitCount++;
    bestMatch.lastHit = new Date().toISOString();
    saveCache();

    return {
      response: bestMatch.response,
      sources: bestMatch.sources,
      cached: true,
      cacheType: 'semantic',
      similarity: bestScore,
      originalQuery: bestMatch.query
    };
  }

  return null;
}

/**
 * Add query-response pair to cache
 *
 * @param {string} query - User query
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {string} response - LLM response
 * @param {Array<Object>} sources - Retrieved chunks
 */
export function addToCache(query, queryEmbedding, response, sources) {
  const cache = loadCache();

  // Check if we need to evict (LRU)
  if (cache.queries.length >= MAX_CACHE_SIZE) {
    evictLRU(cache);
  }

  // Add new entry
  const entry = {
    id: `cache_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    query: query,
    queryEmbedding: queryEmbedding,
    response: response,
    sources: sources.map(s => ({
      id: s.id,
      source: s.source,
      section: s.section,
      similarity: s.similarity
    })),
    hitCount: 1,
    createdAt: new Date().toISOString(),
    lastHit: new Date().toISOString()
  };

  cache.queries.push(entry);
  saveCache();

  console.log(`✓ Added query to cache (total: ${cache.queries.length})`);
}

/**
 * Evict least recently used entry
 */
function evictLRU(cache) {
  if (cache.queries.length === 0) {
    return;
  }

  // Sort by lastHit timestamp (oldest first)
  cache.queries.sort((a, b) => {
    return new Date(a.lastHit).getTime() - new Date(b.lastHit).getTime();
  });

  // Remove oldest
  const evicted = cache.queries.shift();
  console.log(`✓ Evicted LRU cache entry: "${evicted.query.substring(0, 50)}..."`);
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const cache = loadCache();

  const totalHits = cache.queries.reduce((sum, entry) => sum + entry.hitCount, 0);
  const avgHitsPerEntry = cache.queries.length > 0 ? totalHits / cache.queries.length : 0;

  // Sort by hit count to find most popular
  const sortedByHits = [...cache.queries].sort((a, b) => b.hitCount - a.hitCount);
  const topQueries = sortedByHits.slice(0, 5).map(entry => ({
    query: entry.query,
    hits: entry.hitCount
  }));

  return {
    totalEntries: cache.queries.length,
    maxSize: MAX_CACHE_SIZE,
    totalHits: totalHits,
    avgHitsPerEntry: avgHitsPerEntry.toFixed(2),
    topQueries: topQueries,
    semanticThreshold: SEMANTIC_SIMILARITY_THRESHOLD
  };
}

/**
 * Clear all cache entries
 */
export function clearCache() {
  cacheData = initializeCache();
  saveCache();
  console.log('✓ Cache cleared');
}

/**
 * Get cache hit rate (requires tracking misses externally)
 */
export function calculateHitRate(totalRequests) {
  const cache = loadCache();
  const totalHits = cache.queries.reduce((sum, entry) => sum + entry.hitCount, 0);
  return totalRequests > 0 ? (totalHits / totalRequests) * 100 : 0;
}
