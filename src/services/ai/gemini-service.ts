import { GoogleGenAI, Schema, Type } from '@google/genai';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';

export interface GeminiParsedMessage {
  message_id: string;
  is_cng_update: boolean;
  is_cng_available: boolean;
  price: number | null;
  note: string | null;
}

export class GeminiService {
  private ai: GoogleGenAI;
  private modelName = 'gemini-flash-lite-latest';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
  }

  /**
   * Verifies if the configured GEMINI_API_KEY is working by executing a tiny test call.
   */
  public async verifyApiKey(): Promise<boolean> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: 'Say OK',
      });
      if (response.text?.trim().includes('OK')) {
        logger.info('✅ Google Gemini API Connection Verified Successfully! API Key is valid.');
        return true;
      }
      logger.warn('⚠️ Google Gemini API connection returned unexpected response.');
      return false;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, `❌ Google Gemini API Key Validation Failed: ${errMsg}`);
      return false;
    }
  }

  /**
   * Sends a batch of messages to Gemini 1.5 Flash to parse availability details
   * using a strictly enforced JSON schema output.
   */
  public async parseMessages(
    messages: Array<{
      message_id: string;
      text: string;
      media_base64?: string | null;
      media_mime?: string | null;
    }>,
  ): Promise<GeminiParsedMessage[]> {
    if (messages.length === 0) return [];

    logger.debug({ count: messages.length }, 'Sending batch of messages to Gemini for parsing.');

    // Construct the user input containing all messages and image references
    const contents: any[] = [];
    let textPrompt = 'Analyze the following messages and any attached images to extract CNG status:\n\n';

    for (const m of messages) {
      textPrompt += `[ID: ${m.message_id}] `;
      if (m.media_base64 && m.media_mime) {
        textPrompt += `Attached Image (see corresponding image part below). `;
      }
      textPrompt += `Text Content: "${m.text || ''}"\n`;
    }

    contents.push(textPrompt);

    // Append the base64 media parts labeled with their message ID
    for (const m of messages) {
      if (m.media_base64 && m.media_mime) {
        contents.push(`\nImage for [ID: ${m.message_id}]:`);
        contents.push({
          inlineData: {
            mimeType: m.media_mime,
            data: m.media_base64,
          },
        });
      }
    }

    const systemInstruction = `
You are an intelligent CNG status extractor. For each message and its attached media, parse and extract:
1. "is_cng_update": true if it contains a status update (availability, price, queue, pressure, closure). false for chats, greetings, or questions.
2. "is_cng_available": true if open/running/started. false if closed/empty/stopped/out of stock.
3. "price": Numeric price if mentioned, else null.
4. "note": A brief summary of status reasons, waiting times, or queue details. CRITICAL: Extract and write this note in the EXACT language and script found in the source text or image. Do NOT translate it.

Map each output to its "message_id".
`;

    // Define the response schema using plain JSON Schema structure
    const responseSchema: Schema = {
      type: Type.ARRAY,
      description: 'List of parsed CNG availability details mapped by message ID',
      items: {
        type: Type.OBJECT,
        properties: {
          message_id: {
            type: Type.STRING,
            description: 'The unique message ID from the input',
          },
          is_cng_update: {
            type: Type.BOOLEAN,
            description: 'True if the message contains a relevant CNG status update, false if general chat or greeting',
          },
          is_cng_available: {
            type: Type.BOOLEAN,
            description: 'True if CNG is currently available/open, false if closed/out of stock',
          },
          price: {
            type: Type.NUMBER,
            description: 'Current price of CNG per kg, or null if not specified',
          },
          note: {
            type: Type.STRING,
            description:
              'Short status note about queue size, waiting time, or reason for closure in the ORIGINAL source language (do not translate to English), or null if not specified',
          },
        },
        required: ['message_id', 'is_cng_update', 'is_cng_available'],
      },
    };

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.1, // Low temperature for deterministic output matching schema
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error('Gemini returned an empty response text.');
      }

      logger.debug({ responseText }, 'Received raw JSON response from Gemini.');
      const parsedResults = JSON.parse(responseText) as GeminiParsedMessage[];
      return parsedResults;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, `Gemini content generation failed: ${errMsg}`);
      throw new Error(`Gemini parsing failed: ${errMsg}`, { cause: err });
    }
  }
}
