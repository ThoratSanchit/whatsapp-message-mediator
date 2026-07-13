import { PendingMessage } from '../database/models/pending-message-model.js';
import { Station } from '../database/models/station-model.js';
import { GeminiService } from '../ai/gemini-service.js';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';

export class QueueWorker {
  private geminiService: GeminiService;
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Starts the background queue polling loop.
   */
  public start(): void {
    if (this.intervalId) {
      logger.warn('QueueWorker is already running.');
      return;
    }

    const intervalMs = config.QUEUE_POLL_INTERVAL_MS;
    logger.info({ intervalMs }, 'Starting background QueueWorker loop...');

    // Verify Gemini API key connectivity asynchronously at startup
    this.geminiService.verifyApiKey().then((isValid) => {
      if (!isValid) {
        logger.error(
          '⚠️ Gemini QueueWorker started but API key validation failed. Please check your GEMINI_API_KEY.',
        );
      }
    });

    this.intervalId = setInterval(() => this.processQueue(), intervalMs);
  }

  /**
   * Stops the background queue polling loop.
   */
  public stop(): void {
    if (this.intervalId) {
      logger.info('Stopping background QueueWorker...');
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Retrieves pending messages, parses them via Gemini AI, and updates station records.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('QueueWorker processing is already in progress, skipping this tick.');
      return;
    }

    this.isProcessing = true;
    try {
      // 1. Fetch up to 20 pending messages
      const pendingMessages = await PendingMessage.findAll({
        where: {
          status: 'pending',
        },
        order: [['timestamp', 'ASC']],
        limit: 20,
      });

      if (pendingMessages.length === 0) {
        return;
      }

      logger.info(
        { count: pendingMessages.length },
        'Found pending messages in queue. Start parsing...',
      );

      // Filter out messages that have no station_id (i.e. unregistered groups)
      const messagesToParse = pendingMessages
        .filter((m) => m.station_id !== null)
        .map((m) => ({
          message_id: m.message_id,
          text: m.message_text,
          media_base64: m.media_base64,
          media_mime: m.media_mime,
        }));

      // If we have messages to parse via AI
      if (messagesToParse.length > 0) {
        const parseResults = await this.geminiService.parseMessages(messagesToParse);

        // Update database records
        for (const result of parseResults) {
          const messageRecord = pendingMessages.find((m) => m.message_id === result.message_id);
          if (!messageRecord || !messageRecord.station_id) continue;

          try {
            // Update corresponding station status
            const station = await Station.findByPk(messageRecord.station_id);
            if (station) {
              await station.update({
                is_cng_available: result.is_cng_available,
                price: result.price,
                note: messageRecord.message_text,
                last_updated: new Date(),
              });
              logger.info(
                {
                  stationId: station.id,
                  stationName: station.station_name,
                  isCngAvailable: result.is_cng_available,
                },
                'Successfully updated station record with parsed AI details.',
              );
            }

            // Mark message as completed
            await messageRecord.update({ status: 'completed' });
          } catch (err: unknown) {
            logger.error(
              { err, messageId: result.message_id },
              'Failed to update station/message records.',
            );
            await messageRecord.update({ status: 'failed' });
          }
        }
      }

      // Handle pending messages that had no station_id (unregistered groups)
      // We mark them as completed immediately so they do not block the queue
      const unregisteredMessages = pendingMessages.filter((m) => m.station_id === null);
      for (const msg of unregisteredMessages) {
        await msg.update({ status: 'completed' });
        logger.debug(
          { messageId: msg.message_id },
          'Marked unregistered group message as completed.',
        );
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Error occurred inside processQueue worker iteration.');
    } finally {
      this.isProcessing = false;
    }
  }
}
