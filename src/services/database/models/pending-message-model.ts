import { DataTypes, Model, Sequelize } from 'sequelize';

export class PendingMessage extends Model {
  declare id: number;
  declare station_id: string | null;
  declare message_id: string;
  declare sender_jid: string;
  declare sender_name: string;
  declare group_jid: string | null;
  declare group_name: string | null;
  declare message_text: string;
  declare timestamp: Date;
  declare status: string;
  declare media_base64: string | null;
  declare media_mime: string | null;
  declare readonly created_on: Date;
  declare readonly updated_on: Date;
}

export function initPendingMessageModel(sequelize: Sequelize): void {
  PendingMessage.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      station_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      message_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      sender_jid: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sender_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      group_jid: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      group_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      message_text: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      media_base64: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      media_mime: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: 'temp_pending_messages',
      timestamps: true,
      createdAt: 'created_on',
      updatedAt: 'updated_on',
    },
  );
}
