import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from '../../config/index.js';
import { logger } from '../../logger/index.js';
import { errorHandler } from '../../errors/error-handler.js';
import { WhatsAppListener } from './listener.js';
import { ConnectionError } from '../../errors/app-error.js';

export type WASocketType = WASocket;

export class WhatsAppClient {
  private sock: WASocketType | null = null;
  private retryCount = 0;
  private maxRetries = 10;
  private baseDelay = 2000; // 2 seconds
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private listener: WhatsAppListener) {}

  /**
   * Returns the current active Baileys socket.
   */
  public getSock(): WASocketType | null {
    return this.sock;
  }

  /**
   * Initializes and connects to WhatsApp.
   */
  public async connect(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      logger.info('Initializing WhatsApp connection...');
      const { state, saveCreds } = await useMultiFileAuthState(config.SESSION_PATH);

      // Fetch the latest Baileys version, fallback to a standard version if offline
      let version: [number, number, number] = [2, 3000, 1015978507];
      let isLatest = false;
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        isLatest = latest.isLatest;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.warn(
          { err: errMsg },
          'Failed to fetch latest Baileys version from API. Using fallback version.',
        );
      }

      logger.info({ version: version.join('.'), isLatest }, 'Using Baileys version configuration');

      // Setup a quiet logger for internal Baileys operations to keep logs clean
      const baileysLogger = logger.child({ module: 'baileys-internal' }, { level: 'warn' });

      // Create socket connection
      this.sock = makeWASocket({
        version,
        auth: state,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        logger: baileysLogger as any,
        printQRInTerminal: false, // Disabling default to handle styling and logs via qrcode-terminal
        browser: ['Windows', 'Chrome', '124.0.0.0'], // Mimic a standard desktop browser for linkage stability
      });

      // Register listener event subscriptions
      this.listener.register(this.sock);

      // Save credentials whenever updated (crucial for maintaining session)
      this.sock.ev.on('creds.update', async () => {
        try {
          await saveCreds();
        } catch (err) {
          errorHandler.handleError(err, { context: 'Save credentials' });
        }
      });

      // Handle connection updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Render QR Code in terminal if generated
        if (qr) {
          // eslint-disable-next-line no-console
          console.clear(); // Clear terminal screen to prevent scanning expired/scrolled QR codes
          logger.info('👉 Scan the QR code below using WhatsApp Link Device to authenticate:');
          qrcode.generate(qr, { small: true });
        }

        if (connection === 'connecting') {
          logger.info('Connecting to WhatsApp...');
        }

        if (connection === 'open') {
          logger.info('✅ WhatsApp connection successfully established!');
          this.retryCount = 0; // Reset reconnection retry counter
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          logger.warn(
            { statusCode, shouldReconnect, err: lastDisconnect?.error?.message },
            'WhatsApp connection closed.',
          );

          if (shouldReconnect) {
            this.handleReconnect();
          } else {
            logger.error('Logged out from WhatsApp. Session credentials invalidated.');
            this.sock = null;
          }
        }
      });
    } catch (err) {
      errorHandler.handleError(
        new ConnectionError('Failed to initialize WhatsApp connection', {
          originalError: err,
        }),
      );
      this.handleReconnect();
    }
  }

  /**
   * Reconnects to WhatsApp using exponential backoff.
   */
  private handleReconnect(): void {
    if (this.isShuttingDown) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.retryCount >= this.maxRetries) {
      logger.fatal(
        { retryCount: this.retryCount },
        'Max reconnection attempts reached. Process exiting.',
      );
      process.exit(1);
    }

    // Calculate delay: baseDelay * 2^retryCount capped at 60s
    const delay = Math.min(this.baseDelay * Math.pow(2, this.retryCount), 60000);
    this.retryCount++;

    logger.info(
      { retryCount: this.retryCount, nextRetryInMs: delay },
      `Attempting reconnection in ${delay / 1000}s...`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        errorHandler.handleError(err, { context: 'Reconnection handler' });
      });
    }, delay);
  }

  /**
   * Gracefully shuts down the connection.
   */
  public async shutdown(): Promise<void> {
    logger.info('Shutting down WhatsApp client...');
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
        logger.info('WhatsApp socket connection closed.');
      } catch (err) {
        logger.error({ err }, 'Error during socket shutdown.');
      } finally {
        this.sock = null;
      }
    }
  }
}
