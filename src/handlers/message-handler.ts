import { WASocket } from '@whiskeysockets/baileys';
import { Op } from 'sequelize';
import { IMessageHandler, NormalizedMessage } from '../types/index.js';
import { GroupCache } from '../services/whatsapp/group-cache.js';
import { Station } from '../services/database/models/station-model.js';
import { PendingMessage } from '../services/database/models/pending-message-model.js';
import { logger } from '../logger/index.js';
import { config } from '../config/index.js';

export class MessageHandler implements IMessageHandler {
  private allowedGroupsCache: Set<string> = new Set();
  private lastCacheUpdate: number = 0;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(
    private groupCache: GroupCache,
    private sockProvider: { getSock(): WASocket | null },
  ) {}

  /**
   * Initializes the handler by pre-loading the allowed groups cache.
   */
  public async initialize(): Promise<void> {
    await this.updateAllowedGroupsCache();
  }

  /**
   * Updates the in-memory cache of allowed group names and JIDs from the stations table.
   */
  private async updateAllowedGroupsCache(): Promise<void> {
    try {
      const stations = await Station.findAll({
        attributes: ['station_name', 'display_name', 'group_jid'],
      });

      const newCache = new Set<string>();
      for (const station of stations) {
        if (station.group_jid) {
          newCache.add(station.group_jid.toLowerCase());
        }
        if (station.station_name) {
          newCache.add(station.station_name.toLowerCase());
        }
        if (station.display_name) {
          newCache.add(station.display_name.toLowerCase());
        }
      }

      this.allowedGroupsCache = newCache;
      this.lastCacheUpdate = Date.now();
      const pumpNames = stations.map(s => s.station_name || s.display_name).filter(Boolean);
      logger.info(
        { 
          pumpCount: stations.length,
          cachedPumps: pumpNames,
          cacheKeyCount: this.allowedGroupsCache.size 
        },
        'In-memory allowed groups cache updated from database.',
      );
    } catch (err: unknown) {
      logger.error({ err }, 'Failed to load allowed groups cache from database.');
    }
  }

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

      // Lazy load or refresh allowed groups cache if TTL has expired
      if (this.allowedGroupsCache.size === 0 || Date.now() - this.lastCacheUpdate > this.cacheTTL) {
        await this.updateAllowedGroupsCache();
      }

      // 2. Perform fast in-memory allowed filter check
      const groupNameLower = groupDisplay.toLowerCase();
      const groupJidLower = message.groupJid?.toLowerCase() || '';

      const isAllowedByDbCache =
        this.allowedGroupsCache.has(groupJidLower) || this.allowedGroupsCache.has(groupNameLower);

      const allowedGroups = config.ALLOWED_GROUPS;
      const isAllowedByEnv =
        allowedGroups.length > 0 &&
        allowedGroups.some((allowedName) => {
          const normalizedAllowed = allowedName.toLowerCase();
          return (
            groupJidLower.includes(normalizedAllowed) || groupNameLower.includes(normalizedAllowed)
          );
        });

      const isAllowed = isAllowedByDbCache || isAllowedByEnv || allowedGroups.length === 0;

      if (!isAllowed) {
        logger.debug(
          { groupJid: message.groupJid, groupName: groupDisplay, messageId: message.id },
          'Message filtered out: Group is neither registered in DB nor matches ALLOWED_GROUPS.',
        );
        return;
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

              // Refresh cache immediately so that it resolves instantly by JID next time
              await this.updateAllowedGroupsCache();
            }
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
