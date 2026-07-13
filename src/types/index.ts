export interface NormalizedMessage {
  id: string;
  remoteJid: string;
  senderJid: string;
  senderName: string;
  timestamp: Date;
  isGroup: boolean;
  groupJid: string | null;
  messageType: string;
  content: string;
  mediaBase64?: string | null;
  mediaMime?: string | null;
}

export interface IMessageHandler {
  handle(message: NormalizedMessage): Promise<void>;
}
