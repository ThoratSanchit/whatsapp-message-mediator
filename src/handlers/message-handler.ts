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
   * Normalizes a string by converting it to lowercase, replacing punctuation and spaces with a single space, and trimming.
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[.,\-_:()\s]+/g, ' ')
      .trim();
  }

  /**
   * Computes the Levenshtein distance between two strings.
   */
  private getLevenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1,     // deletion
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * Calculates similarity percentage between two strings (0.0 to 1.0) using normalized Levenshtein distance.
   */
  private getSimilarity(s1: string, s2: string): number {
    const norm1 = this.normalizeString(s1);
    const norm2 = this.normalizeString(s2);
    const len = Math.max(norm1.length, norm2.length);
    if (len === 0) return 1.0;
    const dist = this.getLevenshteinDistance(norm1, norm2);
    return (len - dist) / len;
  }

  /**
   * Updates the in-memory cache of allowed group names and JIDs from the stations table.
   */
  private async updateAllowedGroupsCache(): Promise<void> {
    try {
      const stations = await Station.findAll({
        attributes: ['station_name', 'whatsapp_group_name', 'group_jid'],
      });

      const newCache = new Set<string>();
      for (const station of stations) {
        if (station.group_jid) {
          newCache.add(station.group_jid.toLowerCase());
        }
        if (station.station_name) {
          const name = station.station_name.toLowerCase().trim();
          newCache.add(name);
          newCache.add(this.normalizeString(name));
        }
        if (station.whatsapp_group_name) {
          const disp = station.whatsapp_group_name.toLowerCase().trim();
          newCache.add(disp);
          newCache.add(this.normalizeString(disp));
        }
      }

      this.allowedGroupsCache = newCache;
      this.lastCacheUpdate = Date.now();
      const pumpNames = stations.map((s) => s.station_name || s.whatsapp_group_name).filter(Boolean);
      logger.info(
        {
          pumpCount: stations.length,
          cachedPumps: pumpNames,
          cacheKeyCount: this.allowedGroupsCache.size,
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
      const groupNameNormalized = this.normalizeString(groupDisplay);
      const groupJidLower = message.groupJid?.toLowerCase() || '';

      let isAllowedByDbCache =
        this.allowedGroupsCache.has(groupJidLower) ||
        this.allowedGroupsCache.has(groupNameLower) ||
        this.allowedGroupsCache.has(groupNameNormalized);

      // If still not matched, perform similarity check against all cached allowed names
      if (!isAllowedByDbCache && groupJidLower === '') {
        for (const cachedName of this.allowedGroupsCache) {
          // Skip actual JIDs
          if (cachedName.endsWith('@g.us')) continue;
          if (this.getSimilarity(groupDisplay, cachedName) >= 0.8) {
            isAllowedByDbCache = true;
            break;
          }
        }
      }

      const allowedGroups = config.ALLOWED_GROUPS;
      const isAllowedByEnv =
        allowedGroups.length > 0 &&
        allowedGroups.some((allowedName) => {
          const normalizedAllowed = allowedName.toLowerCase();
          return (
            groupJidLower.includes(normalizedAllowed) || groupNameLower.includes(normalizedAllowed)
          );
        });

      const isAllowed = isAllowedByDbCache || isAllowedByEnv;

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
          let matchedStation = await Station.findOne({
            where: { group_jid: message.groupJid },
          });

          if (!matchedStation) {
            const allStations = await Station.findAll();
            const normalizedIncoming = this.normalizeString(groupDisplay);

            matchedStation =
              allStations.find((s) => {
                const nameNorm = s.station_name ? this.normalizeString(s.station_name) : '';
                const dispNorm = s.whatsapp_group_name ? this.normalizeString(s.whatsapp_group_name) : '';
                return (
                  nameNorm === normalizedIncoming ||
                  dispNorm === normalizedIncoming ||
                  this.getSimilarity(groupDisplay, s.station_name || '') >= 0.8 ||
                  this.getSimilarity(groupDisplay, s.whatsapp_group_name || '') >= 0.8
                );
              }) || null;
          }

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
          media_base64: message.mediaBase64 || null,
          media_mime: message.mediaMime || null,
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
