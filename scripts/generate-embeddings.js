/**
 * Generate embeddings from knowledge base
 *
 * This script:
 * 1. Reads all markdown files from /knowledge/
 * 2. Parses and chunks content
 * 3. Generates embeddings using transformers.js
 * 4. Saves to /data/embeddings.json
 *
 * Run: node scripts/generate-embeddings.js
 */

import { pipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chunkText, parseMarkdownSections, extractMetadata } from '../src/lib/chunking.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Paths
const KNOWLEDGE_DIR = path.join(projectRoot, 'knowledge');
const DATA_DIR = path.join(projectRoot, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'embeddings.json');

// Configuration
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const MAX_TOKENS = 500;
const OVERLAP_TOKENS = 50;

/**
 * Recursively find all markdown files in directory
 */
function findMarkdownFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process a single markdown file
 */
function processMarkdownFile(filepath) {
  console.log(`Processing: ${path.relative(projectRoot, filepath)}`);

  const content = fs.readFileSync(filepath, 'utf-8');
  const sections = parseMarkdownSections(content, filepath);
  const metadata = extractMetadata(filepath);

  const chunks = [];

  for (const section of sections) {
    // Skip template placeholders
    if (section.content.includes('[Add your') ||
        section.content.includes('[Your ') ||
        section.content.includes('[Describe ') ||
        section.content.includes('[Write ') ||
        section.content.includes('[Share ') ||
        section.content.length < 50) {
      console.log(`  ⚠️  Skipping placeholder section: ${section.title}`);
      continue;
    }

    const sectionChunks = chunkText(section.content, MAX_TOKENS, OVERLAP_TOKENS);

    for (let i = 0; i < sectionChunks.length; i++) {
      chunks.push({
        content: sectionChunks[i],
        section: section.title,
        chunkIndex: i,
        totalChunks: sectionChunks.length,
        metadata: {
          ...metadata,
          sectionLevel: section.level
        }
      });
    }
  }

  console.log(`  ✓ Generated ${chunks.length} chunks`);
  return chunks;
}

/**
 * Generate embeddings for all chunks
 */
async function generateEmbeddings(chunks) {
  console.log('\nGenerating embeddings...');
  console.log(`Model: ${EMBEDDING_MODEL}`);

  // Load the embedding model
  const embedder = await pipeline('feature-extraction', EMBEDDING_MODEL);

  const chunksWithEmbeddings = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Generate embedding
    const output = await embedder(chunk.content, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);

    chunksWithEmbeddings.push({
      id: `chunk_${i + 1}`,
      content: chunk.content,
      embedding: embedding,
      source: chunk.metadata.source,
      section: chunk.section,
      metadata: chunk.metadata
    });

    // Progress indicator
    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`  Progress: ${i + 1}/${chunks.length} chunks`);
    }
  }

  console.log('✓ Embeddings generated successfully');
  return chunksWithEmbeddings;
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Embedding Generation Script');
  console.log('='.repeat(60));

  // Check if knowledge directory exists
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`❌ Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    process.exit(1);
  }

  // Create data directory if it doesn't exist
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Find all markdown files
  console.log('\nScanning for markdown files...');
  const markdownFiles = findMarkdownFiles(KNOWLEDGE_DIR);

  if (markdownFiles.length === 0) {
    console.error('❌ No markdown files found in knowledge directory');
    console.log('\nPlease add your content to:');
    console.log('  - knowledge/resume.md');
    console.log('  - knowledge/about.md');
    console.log('  - knowledge/projects/*.md');
    process.exit(1);
  }

  console.log(`Found ${markdownFiles.length} files:\n`);
  markdownFiles.forEach(f => console.log(`  - ${path.relative(projectRoot, f)}`));

  // Process all files
  console.log('\n' + '-'.repeat(60));
  const allChunks = [];

  for (const filepath of markdownFiles) {
    const chunks = processMarkdownFile(filepath);
    allChunks.push(...chunks);
  }

  console.log('-'.repeat(60));
  console.log(`\nTotal chunks: ${allChunks.length}`);

  if (allChunks.length === 0) {
    console.error('\n No valid content found. Please fill in the template files with your information.');
    process.exit(1);
  }

  // Generate embeddings
  console.log('\n' + '-'.repeat(60));
  const chunksWithEmbeddings = await generateEmbeddings(allChunks);

  // Save to file
  console.log('\n' + '-'.repeat(60));
  console.log('Saving embeddings...');

  const output = {
    chunks: chunksWithEmbeddings,
    metadata: {
      model: EMBEDDING_MODEL,
      dimension: chunksWithEmbeddings[0].embedding.length,
      totalChunks: chunksWithEmbeddings.length,
      generatedAt: new Date().toISOString(),
      version: '1.0'
    }
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));

  console.log(`✓ Saved to: ${path.relative(projectRoot, OUTPUT_FILE)}`);
  console.log(`✓ Embedding dimension: ${output.metadata.dimension}`);
  console.log(`✓ Total chunks: ${output.metadata.totalChunks}`);

  // File size
  const stats = fs.statSync(OUTPUT_FILE);
  const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✓ File size: ${fileSizeMB} MB`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Embedding generation complete!');
  console.log('='.repeat(60));
  console.log('\nNext steps:');
  console.log('  1. Review data/embeddings.json');
  console.log('  2. Test with: node scripts/test-embeddings.js');
  console.log('  3. Start dev server: npm run dev');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
