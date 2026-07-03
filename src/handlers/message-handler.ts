import { WASocket } from '@whiskeysockets/baileys';
import { IMessageHandler, NormalizedMessage } from '../types/index.js';
import { GroupCache } from '../services/whatsapp/group-cache.js';
import { logger } from '../logger/index.js';
import { config } from '../config/index.js';

export class MessageHandler implements IMessageHandler {
  constructor(
    private groupCache: GroupCache,
    private sockProvider: { getSock(): WASocket | null },
  ) {}

  /**
   * Processes a normalized message: retrieves group metadata if group message,
   * formats details, and prints the output to console in a structured format.
   */
  public async handle(message: NormalizedMessage): Promise<void> {
    try {
      let groupDisplay = 'Private Chat';

      // 1. Resolve the group name if it's a group message
      if (message.isGroup && message.groupJid) {
        const sock = this.sockProvider.getSock();
        if (sock) {
          groupDisplay = await this.groupCache.getGroupName(sock, message.groupJid);
        } else {
          groupDisplay = message.groupJid;
        }
      }

      // 2. Apply ALLOWED_GROUPS filter if configured (supports case-insensitive partial JID or Group Name matching)
      if (config.ALLOWED_GROUPS.length > 0) {
        const isAllowed =
          message.isGroup &&
          message.groupJid &&
          config.ALLOWED_GROUPS.some((allowedName) => {
            const normalizedAllowed = allowedName.toLowerCase();
            return (
              message.groupJid!.toLowerCase().includes(normalizedAllowed) ||
              groupDisplay.toLowerCase().includes(normalizedAllowed)
            );
          });

        if (!isAllowed) {
          logger.debug(
            { groupJid: message.groupJid, groupName: groupDisplay, messageId: message.id },
            'Message filtered out: Neither JID nor Name matches any ALLOWED_GROUPS entries.',
          );
          return;
        }
      }

      // Format Timestamp (YYYY-MM-DD HH:mm:ss)
      const timestampStr = message.timestamp.toISOString().replace('T', ' ').substring(0, 19);

      const senderDetails = `${message.senderName} (${message.senderJid})`;

      // Create structured format matching requested design
      const formattedOutput = `\n------------------------------------------------
Timestamp : ${timestampStr}
Group : ${groupDisplay}
Sender : ${senderDetails}
Message Type : ${message.messageType}
Message : ${message.content}
------------------------------------------------`;

      logger.info(formattedOutput);
    } catch (error) {
      // Centralized safety check - never crash the application on handling errors
      logger.error(
        { err: error, msgId: message.id },
        'Error occurred in message handling pipeline.',
      );
    }
  }
}
