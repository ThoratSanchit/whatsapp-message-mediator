import { proto, extractMessageContent } from '@whiskeysockets/baileys';
import { NormalizedMessage } from '../types/index.js';

/**
 * Normalizes a raw Baileys message object into a clean, unified NormalizedMessage structure.
 * Returns null if the message is a status update or has invalid properties.
 */
export function normalizeMessage(msg: proto.IWebMessageInfo): NormalizedMessage | null {
  if (!msg.key) {
    return null;
  }

  const id = msg.key.id;
  const remoteJid = msg.key.remoteJid;

  if (!id || !remoteJid) {
    return null;
  }

  // Ignore status updates
  if (remoteJid === 'status@broadcast') {
    return null;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const groupJid = isGroup ? remoteJid : null;

  // Resolve sender details
  // In groups, participant JID represents the sender. If missing, fallback to remoteJid.
  const senderJid = isGroup ? msg.key.participant || '' : remoteJid;
  const senderName = msg.pushName || senderJid.split('@')[0] || 'Unknown';

  const timestamp = msg.messageTimestamp
    ? new Date(Number(msg.messageTimestamp) * 1000)
    : new Date();

  // Extract inner content from wrapping layers (e.g. ephemeral, viewOnce)
  const messageContent = extractMessageContent(msg.message);

  if (!messageContent) {
    return {
      id,
      remoteJid,
      senderJid,
      senderName,
      timestamp,
      isGroup,
      groupJid,
      messageType: 'empty',
      content: '[System or Empty Message]',
    };
  }

  let messageType = 'other';
  let content = '[Unsupported Message Type]';

  // Handle standard message sub-types
  if (messageContent.conversation) {
    messageType = 'text';
    content = messageContent.conversation;
  } else if (messageContent.extendedTextMessage) {
    messageType = 'text';
    content = messageContent.extendedTextMessage.text || '';
  } else if (messageContent.imageMessage) {
    messageType = 'image';
    content = messageContent.imageMessage.caption || '[Image]';
  } else if (messageContent.videoMessage) {
    messageType = 'video';
    content = messageContent.videoMessage.caption || '[Video]';
  } else if (messageContent.audioMessage) {
    messageType = 'audio';
    content = '[Audio]';
  } else if (messageContent.documentMessage) {
    messageType = 'document';
    const docName =
      messageContent.documentMessage.fileName || messageContent.documentMessage.title || 'Document';
    content = `[Document: ${docName}]`;
  } else if (messageContent.stickerMessage) {
    messageType = 'sticker';
    content = '[Sticker]';
  } else if (messageContent.locationMessage) {
    messageType = 'location';
    const lat = messageContent.locationMessage.degreesLatitude;
    const lng = messageContent.locationMessage.degreesLongitude;
    content = `[Location: Lat ${lat}, Lng ${lng}]`;
  } else if (messageContent.contactMessage) {
    messageType = 'contact';
    content = `[Contact: ${messageContent.contactMessage.displayName || 'Unknown'}]`;
  } else if (messageContent.contactsArrayMessage) {
    messageType = 'contacts';
    const contactsList =
      messageContent.contactsArrayMessage.contacts
        ?.map((c: { displayName?: string | null }) => c.displayName)
        .join(', ') || 'Unknown';
    content = `[Contacts: ${contactsList}]`;
  } else if (messageContent.pollCreationMessage) {
    messageType = 'poll';
    content = `[Poll: ${messageContent.pollCreationMessage.name || 'Untitled'}]`;
  } else if (messageContent.reactionMessage) {
    messageType = 'reaction';
    content = `[Reaction: ${messageContent.reactionMessage.text || ''}]`;
  } else if (messageContent.protocolMessage) {
    messageType = 'protocol';
    content = '[Protocol/System Message]';
  }

  return {
    id,
    remoteJid,
    senderJid,
    senderName,
    timestamp,
    isGroup,
    groupJid,
    messageType,
    content,
  };
}
