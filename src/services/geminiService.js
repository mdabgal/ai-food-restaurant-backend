'use strict';

const { GoogleGenAI } = require('@google/genai');

class GeminiServiceError extends Error {
  constructor(message, status = 503, code = 'GEMINI_ERROR') {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
    this.code = code;
  }
}

let client;

const getClient = () => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiServiceError(
      'AI features are not configured. Please add GEMINI_API_KEY to the backend environment.',
      503,
      'GEMINI_NOT_CONFIGURED'
    );
  }

  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
};

const mapProviderError = (error) => {
  if (error instanceof GeminiServiceError) return error;

  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 429) {
    return new GeminiServiceError(
      'The AI service rate limit was reached. Please wait a moment and try again.',
      429,
      'GEMINI_RATE_LIMIT'
    );
  }
  if (status === 401 || status === 403) {
    return new GeminiServiceError(
      'The AI service is not configured correctly.',
      503,
      'GEMINI_AUTH_ERROR'
    );
  }
  if (error?.name === 'AbortError') {
    return new GeminiServiceError(
      'The AI request timed out. Please try again.',
      504,
      'GEMINI_TIMEOUT'
    );
  }

  return new GeminiServiceError(
    'The AI service is temporarily unavailable. Please try again later.',
    503,
    'GEMINI_UNAVAILABLE'
  );
};

const generateStructuredContent = async ({ prompt, responseJsonSchema, maxOutputTokens = 1024 }) => {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 30_000);

  try {
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        abortSignal: abortController.signal,
        temperature: 0.35,
        maxOutputTokens,
        responseMimeType: 'application/json',
        responseJsonSchema,
      },
    });

    if (!response.text) {
      throw new GeminiServiceError('The AI service returned an empty response.', 502, 'EMPTY_AI_RESPONSE');
    }

    try {
      return JSON.parse(response.text);
    } catch {
      throw new GeminiServiceError('The AI service returned an invalid response.', 502, 'INVALID_AI_RESPONSE');
    }
  } catch (error) {
    throw mapProviderError(error);
  } finally {
    clearTimeout(timeout);
  }
};

module.exports = { generateStructuredContent, GeminiServiceError };
