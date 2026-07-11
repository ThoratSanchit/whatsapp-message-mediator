import { DataTypes, Model, Sequelize } from 'sequelize';

export class Station extends Model {
  declare id: string;
  declare station_name: string;
  declare display_name: string | null;
  declare group_jid: string | null;
  declare owner_name: string | null;
  declare contact_number: string | null;
  declare address: string | null;
  declare latitude: number | null;
  declare longitude: number | null;
  declare status: string;
  declare is_cng_available: boolean;
  declare price: number | null;
  declare note: string | null;
  declare last_updated: Date | null;
  declare created_by: string | null;
  declare is_verified: boolean;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initStationModel(sequelize: Sequelize): void {
  Station.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      station_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      display_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      group_jid: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      owner_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contact_number: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      longitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending',
      },
      is_cng_available: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      last_updated: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      tableName: 'stations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  );
}
