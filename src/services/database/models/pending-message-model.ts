import { DataTypes, Model, Sequelize } from 'sequelize';

export class PendingMessage extends Model {
  public id!: number;
  public station_id!: string | null;
  public message_id!: string;
  public sender_jid!: string;
  public sender_name!: string;
  public group_jid!: string | null;
  public group_name!: string | null;
  public message_text!: string;
  public timestamp!: Date;
  public status!: string;
  public readonly created_on!: Date;
  public readonly updated_on!: Date;
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
