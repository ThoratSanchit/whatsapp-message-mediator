import { WASocket } from '@whiskeysockets/baileys';
import { Op } from 'sequelize';
import { IMessageHandler, NormalizedMessage } from '../types/index.js';
import { GroupCache } from '../services/whatsapp/group-cache.js';
import { Station } from '../services/database/models/station-model.js';
import { PendingMessage } from '../services/database/models/pending-message-model.js';
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

      // 3. Match incoming group name against registered stations in the database
      let matchedStationId: string | null = null;
      if (message.isGroup && message.groupJid) {
        try {
          const matchedStation = await Station.findOne({
            where: {
              [Op.or]: [
                { group_jid: message.groupJid },
                { station_name: groupDisplay },
                { display_name: groupDisplay },
              ],
            },
          });

          if (matchedStation) {
            matchedStationId = matchedStation.id;
            logger.debug(
              { groupJid: message.groupJid, stationId: matchedStationId },
              'Matched incoming group message to registered station record.',
            );

            // Automatically associate the group JID if it wasn't saved yet (Self-Healing)
            if (!matchedStation.group_jid) {
              matchedStation.group_jid = message.groupJid;
              await matchedStation.save();
              logger.info(
                { stationId: matchedStation.id, groupJid: message.groupJid },
                'Automatically associated group_jid to station record.',
              );
            }
          } else {
            logger.warn(
              { groupDisplay, groupJid: message.groupJid },
              'No registered station found matching this WhatsApp group name/JID in the database.',
            );
          }
        } catch (err: unknown) {
          logger.error({ err }, 'Failed to lookup matching station in database.');
        }
      }

      // 4. Save message to queue table temp_pending_messages using Sequelize
      await PendingMessage.findOrCreate({
        where: { message_id: message.id },
        defaults: {
          station_id: matchedStationId,
          sender_jid: message.senderJid,
          sender_name: message.senderName,
          group_jid: message.groupJid || null,
          group_name: groupDisplay,
          message_text: message.content,
          timestamp: message.timestamp,
          status: 'pending',
        },
      });
      logger.debug(
        { messageId: message.id, stationId: matchedStationId },
        'Message successfully queued in database via ORM.',
      );

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
