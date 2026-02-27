/**
 * Chat API endpoint with RAG pipeline
 * POST /api/chat
 *
 * Flow:
 * 1. Rate limit check
 * 2. Cache lookup (exact + semantic)
 * 3. Generate query embedding
 * 4. Vector search for relevant chunks
 * 5. Call Gemini API with context
 * 6. Cache response
 * 7. Return to client
 */

import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '../../../lib/rateLimit.js';
import { generateQueryEmbedding, searchTopK } from '../../../lib/vectorSearch.js';
import { checkExactMatch, checkSemanticMatch, addToCache } from '../../../lib/cache.js';

// Initialize Gemini with new SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Get client IP address
 */
function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0] ||
         req.headers.get('x-real-ip') ||
         'unknown';
}

/**
 * Build prompt with retrieved context
 */
function buildPrompt(query, retrievedChunks) {
  const context = retrievedChunks
    .map((chunk, i) => `[${i + 1}] ${chunk.content}`)
    .join('\n\n');

  const systemPrompt = `You are an AI assistant representing Peterson Ngo, a Software Engineer specializing in AI/R&D and backend systems. You have access to Peterson's resume, skills, and professional background.

Your role:
- Answer questions about Peterson's experience, skills, projects, and background
- Be conversational, friendly, and professional
- Use the provided context to give accurate, specific answers
- Vary your responses - don't repeat the same achievements unless directly relevant
- Focus on the MOST relevant information for each question
- If asked about something not in the context, politely say you don't have that information
- Keep responses concise (2-4 paragraphs max) unless asked for details
- Be natural - you don't need to mention every achievement in every answer

Context from Peterson's knowledge base:
${context}

Remember: You are representing Peterson, so speak knowledgeably about his experience while remaining humble and professional. Answer the specific question asked, not everything you know.`;

  return systemPrompt;
}

/**
 * Main API handler
 */
export async function POST(req) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await req.json();
    const { message, sessionId, conversationHistory = [] } = body;

    // Validate input
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { error: 'Session ID is required' },
        { status: 400 }
      );
    }

    if (message.length > 1000) {
      return NextResponse.json(
        { error: 'Message too long (max 1000 characters)' },
        { status: 400 }
      );
    }

    // Rate limit check
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit(sessionId, clientIP);

    if (!rateLimitResult.allowed) {
      const resetInMinutes = Math.ceil(rateLimitResult.resetIn / 60000);
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${resetInMinutes} minutes.`,
          resetIn: rateLimitResult.resetIn,
          resetTime: rateLimitResult.resetTime
        },
        { status: 429 }
      );
    }

    console.log(`\n[${sessionId.substring(0, 8)}] Query: "${message}"`);
    console.log(`Rate limit: ${rateLimitResult.remaining} remaining`);

    // Step 1: Check exact match cache
    const exactMatch = checkExactMatch(message);
    if (exactMatch) {
      console.log('✓ Cache hit (exact match)');
      return NextResponse.json({
        ...exactMatch,
        remaining: rateLimitResult.remaining,
        responseTime: Date.now() - startTime
      });
    }

    // Step 2: Generate query embedding
    console.log('Generating query embedding...');
    const queryEmbedding = await generateQueryEmbedding(message);

    // Step 3: Check semantic cache
    const semanticMatch = checkSemanticMatch(queryEmbedding);
    if (semanticMatch) {
      console.log(`✓ Cache hit (semantic match, similarity: ${semanticMatch.similarity.toFixed(3)})`);
      return NextResponse.json({
        ...semanticMatch,
        remaining: rateLimitResult.remaining,
        responseTime: Date.now() - startTime
      });
    }

    // Step 4: Vector search for relevant chunks
    console.log('Searching knowledge base...');
    const retrievedChunks = searchTopK(queryEmbedding, {
      k: 5,
      threshold: 0.25  // Lowered threshold for better recall
    });

    console.log(`✓ Retrieved ${retrievedChunks.length} relevant chunks`);

    if (retrievedChunks.length === 0) {
      // No relevant context found
      return NextResponse.json({
        response: "I don't have specific information about that in Peterson's knowledge base. Is there something else about his experience, skills, or projects I can help you with?",
        sources: [],
        cached: false,
        remaining: rateLimitResult.remaining,
        responseTime: Date.now() - startTime
      });
    }

    // Step 5: Build prompt and call Gemini
    console.log('Calling Gemini API...');
    const systemPrompt = buildPrompt(message, retrievedChunks);

    // Build full prompt with history
    let fullPrompt = systemPrompt + '\n\nConversation:\n';

    // Add recent conversation history
    if (conversationHistory.length > 0) {
      conversationHistory.slice(-4).forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
    }

    fullPrompt += `\nUser: ${message}\nAssistant:`;

    // Call Gemini with new SDK
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: fullPrompt,
    });

    const response = result.text;

    console.log(`✓ Generated response (${response.length} chars)`);

    // Estimate token usage (rough approximation)
    const tokensUsed = Math.ceil((systemPrompt.length + message.length + response.length) / 4);

    // Step 6: Cache the response
    addToCache(message, queryEmbedding, response, retrievedChunks);

    // Step 7: Return response
    const responseData = {
      response: response,
      sources: retrievedChunks.map(chunk => ({
        id: chunk.id,
        source: chunk.source.replace(/^.*knowledge\//, ''), // Clean path
        section: chunk.section,
        similarity: chunk.similarity,
        preview: chunk.content.substring(0, 150) + '...'
      })),
      cached: false,
      remaining: rateLimitResult.remaining,
      tokensUsed: tokensUsed,
      responseTime: Date.now() - startTime
    };

    console.log(`✓ Request completed in ${responseData.responseTime}ms`);

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Error in chat API:', error);

    // Handle specific error types
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        {
          error: 'Configuration error',
          message: 'AI service is not properly configured. Please contact support.'
        },
        { status: 500 }
      );
    }

    if (error.message?.includes('quota')) {
      return NextResponse.json(
        {
          error: 'Service temporarily unavailable',
          message: 'AI service quota exceeded. Please try again later.'
        },
        { status: 503 }
      );
    }

    // Generic error
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'An error occurred while processing your request. Please try again.',
        details: error.message
      },
      { status: 500 }
    );
  }
}
