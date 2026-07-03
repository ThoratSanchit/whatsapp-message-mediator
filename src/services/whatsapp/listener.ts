import { WASocket, proto } from '@whiskeysockets/baileys';
import { logger } from '../../logger/index.js';
import { normalizeMessage } from '../../utils/message-normalizer.js';
import { IMessageHandler } from '../../types/index.js';
import { errorHandler } from '../../errors/error-handler.js';
import { MessageValidationError } from '../../errors/app-error.js';

export class WhatsAppListener {
  constructor(private messageHandler: IMessageHandler) {}

  /**
   * Registers the message handler event listeners on the WhatsApp socket instance.
   */
  public register(sock: WASocket): void {
    sock.ev.on(
      'messages.upsert',
      async ({
        type,
        messages,
      }: {
        type: 'notify' | 'append';
        messages: proto.IWebMessageInfo[];
      }) => {
        // Only process 'notify' events which correspond to new incoming notifications/messages
        if (type !== 'notify') {
          return;
        }

        logger.debug({ count: messages.length }, 'Received messages upsert event');

        for (const rawMessage of messages) {
          try {
            // Normalize the Baileys raw message format
            const normalized = normalizeMessage(rawMessage);

            if (!normalized) {
              // Message was ignored (e.g. status broadcast or missing IDs)
              continue;
            }

            // Process the normalized message
            await this.messageHandler.handle(normalized);
          } catch (err) {
            // Graceful handling to prevent application crash on a single malformed message
            errorHandler.handleError(
              new MessageValidationError('Failed to parse or handle raw incoming message.', {
                rawMessageId: rawMessage?.key?.id,
                originalError: err,
              }),
            );
          }
        }
      },
    );
  }
}
