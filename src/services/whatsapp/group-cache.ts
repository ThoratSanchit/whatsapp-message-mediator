import { WASocket } from '@whiskeysockets/baileys';
import { logger } from '../../logger/index.js';

export class GroupCache {
  private cache = new Map<string, string>();
  private failedResolutions = new Map<string, { timestamp: number; fallback: string }>();
  private readonly FAILED_TTL_MS = 5 * 60 * 1000; // 5 minutes cache for failed lookups

  /**
   * Resolves a group subject (name) by JID. Uses cached data if available.
   * If lookup fails, caches a fallback to prevent repeated API calls.
   */
  public async getGroupName(sock: WASocket, jid: string): Promise<string> {
    // 1. Check in-memory cache
    if (this.cache.has(jid)) {
      return this.cache.get(jid)!;
    }

    // 2. Check failed resolutions (negative caching)
    const failed = this.failedResolutions.get(jid);
    if (failed) {
      if (Date.now() - failed.timestamp < this.FAILED_TTL_MS) {
        return failed.fallback;
      }
      // TTL expired, retry
      this.failedResolutions.delete(jid);
    }

    try {
      logger.debug({ jid }, 'Fetching group metadata from WhatsApp API');
      const metadata = await sock.groupMetadata(jid);
      const subject = metadata?.subject || 'Unnamed Group';
      this.cache.set(jid, subject);
      return subject;
    } catch (error: unknown) {
      const fallbackName = `Group (${jid.split('@')[0]})`;
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ jid, err: errMsg }, 'Failed to fetch group metadata. Using JID as fallback.');
      this.failedResolutions.set(jid, {
        timestamp: Date.now(),
        fallback: fallbackName,
      });
      return fallbackName;
    }
  }

  /**
   * Explicitly updates a group's name in cache (e.g. if we listen to group update events)
   */
  public updateCache(jid: string, name: string): void {
    this.cache.set(jid, name);
    this.failedResolutions.delete(jid);
  }

  /**
   * Clears the cache
   */
  public clear(): void {
    this.cache.clear();
    this.failedResolutions.clear();
  }
}
