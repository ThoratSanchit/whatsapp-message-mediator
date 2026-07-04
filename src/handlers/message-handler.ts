import { WASocket } from '@whiskeysockets/baileys';
import { IMessageHandler, NormalizedMessage } from '../types/index.js';
import { GroupCache } from '../services/whatsapp/group-cache.js';
import { DatabaseService } from '../services/database/index.js';
import { logger } from '../logger/index.js';
import { config } from '../config/index.js';

export class MessageHandler implements IMessageHandler {
  constructor(
    private groupCache: GroupCache,
    private sockProvider: { getSock(): WASocket | null },
    private dbService: DatabaseService,
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

      // 3. Save message to queue table temp_pending_messages
      const insertMsgQuery = `
        INSERT INTO temp_pending_messages (
          message_id, sender_jid, sender_name, group_jid, group_name, message_text, timestamp, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        ON CONFLICT (message_id) DO NOTHING;
      `;
      await this.dbService.query(insertMsgQuery, [
        message.id,
        message.senderJid,
        message.senderName,
        message.groupJid,
        groupDisplay,
        message.content,
        message.timestamp,
      ]);
      logger.debug({ messageId: message.id }, 'Message successfully queued in database.');

      // 4. Auto-create pump in temp_cng_pump if groupJid is not registered yet (fallback logic)
      if (message.isGroup && message.groupJid) {
        const insertPumpQuery = `
          INSERT INTO temp_cng_pump (pump_name, display_name, group_jid, is_cng_available)
          VALUES ($1, $2, $3, false)
          ON CONFLICT (group_jid) DO NOTHING;
        `;
        await this.dbService.query(insertPumpQuery, [groupDisplay, groupDisplay, message.groupJid]);
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
