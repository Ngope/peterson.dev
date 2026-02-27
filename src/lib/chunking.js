/**
 * Text chunking utilities for RAG pipeline
 * Splits documents into overlapping chunks for better retrieval
 */

/**
 * Simple token counter (approximation: 1 token ≈ 4 characters)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into sentences (basic implementation)
 */
function splitIntoSentences(text) {
  // Split on sentence boundaries while preserving the delimiter
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.trim().length > 0);
}

/**
 * Chunk text by token count with overlap
 *
 * @param {string} text - Text to chunk
 * @param {number} maxTokens - Maximum tokens per chunk (default: 500)
 * @param {number} overlapTokens - Tokens to overlap between chunks (default: 50)
 * @returns {Array<string>} Array of text chunks
 */
export function chunkText(text, maxTokens = 500, overlapTokens = 50) {
  const sentences = splitIntoSentences(text);
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);

    // If adding this sentence exceeds max tokens, save current chunk and start new one
    if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));

      // Create overlap by keeping last few sentences
      const overlapSentences = [];
      let overlapCount = 0;
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(currentChunk[i]);
        if (overlapCount + tokens <= overlapTokens) {
          overlapSentences.unshift(currentChunk[i]);
          overlapCount += tokens;
        } else {
          break;
        }
      }

      currentChunk = overlapSentences;
      currentTokens = overlapCount;
    }

    currentChunk.push(sentence);
    currentTokens += sentenceTokens;
  }

  // Add final chunk if it has content
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks;
}

/**
 * Parse markdown and extract sections with metadata
 *
 * @param {string} content - Markdown content
 * @param {string} filename - Source filename
 * @returns {Array<Object>} Array of sections with metadata
 */
export function parseMarkdownSections(content, filename) {
  const sections = [];
  const lines = content.split('\n');

  let currentSection = {
    title: 'Introduction',
    content: [],
    level: 1
  };

  for (const line of lines) {
    // Check for markdown headers
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Save previous section if it has content
      if (currentSection.content.length > 0) {
        sections.push({
          ...currentSection,
          content: currentSection.content.join('\n').trim()
        });
      }

      // Start new section
      currentSection = {
        title: headerMatch[2],
        content: [],
        level: headerMatch[1].length
      };
    } else if (line.trim()) {
      // Add non-empty lines to current section
      currentSection.content.push(line);
    }
  }

  // Add final section
  if (currentSection.content.length > 0) {
    sections.push({
      ...currentSection,
      content: currentSection.content.join('\n').trim()
    });
  }

  return sections.filter(s => s.content.length > 0);
}

/**
 * Extract metadata from filename and path
 *
 * @param {string} filepath - Full file path
 * @returns {Object} Metadata object
 */
export function extractMetadata(filepath) {
  const parts = filepath.split('/');
  const filename = parts[parts.length - 1].replace('.md', '');

  const metadata = {
    source: filepath,
    filename: filename
  };

  // Detect type from path
  if (filepath.includes('/projects/')) {
    metadata.type = 'project';
  } else if (filepath.includes('resume')) {
    metadata.type = 'resume';
  } else if (filepath.includes('about')) {
    metadata.type = 'about';
  } else {
    metadata.type = 'general';
  }

  return metadata;
}
