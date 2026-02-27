/**
 * Test RAG pipeline
 * Run: npm run test:rag
 */

import { search, getEmbeddingsStats } from '../src/lib/vectorSearch.js';
import { getCacheStats } from '../src/lib/cache.js';
import { getRateLimiterStats } from '../src/lib/rateLimit.js';

const TEST_QUERIES = [
  "What projects have you worked on?",
  "Tell me about your experience with AWS",
  "What is your current role?",
  "Do you have AI experience?",
  "What databases do you know?"
];

async function main() {
  console.log('='.repeat(60));
  console.log('RAG Pipeline Test');
  console.log('='.repeat(60));

  // Test embeddings stats
  console.log('\nEmbeddings Statistics:');
  const stats = getEmbeddingsStats();
  console.log(JSON.stringify(stats, null, 2));

  // Test search
  console.log('\n' + '-'.repeat(60));
  console.log('Testing Vector Search:');
  console.log('-'.repeat(60));

  for (const query of TEST_QUERIES) {
    console.log(`\nQuery: "${query}"`);

    const results = await search(query, { k: 3, threshold: 0.7 });

    console.log(`Found ${results.length} results:`);
    results.forEach((result, i) => {
      console.log(`  ${i + 1}. [${result.similarity.toFixed(3)}] ${result.section} (${result.source})`);
      console.log(`     Preview: ${result.content.substring(0, 100)}...`);
    });
  }

  // Cache stats
  console.log('\n' + '-'.repeat(60));
  console.log('Cache Statistics:');
  const cacheStats = getCacheStats();
  console.log(JSON.stringify(cacheStats, null, 2));

  // Rate limiter stats
  console.log('\n' + '-'.repeat(60));
  console.log('Rate Limiter Statistics:');
  const rateLimitStats = getRateLimiterStats();
  console.log(JSON.stringify(rateLimitStats, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('✅ RAG pipeline test complete!');
  console.log('='.repeat(60));
  console.log('\nNext step: Start dev server with `npm run dev`');
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
