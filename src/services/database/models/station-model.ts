import { DataTypes, Model, Sequelize } from 'sequelize';

export class Station extends Model {
  public id!: string;
  public station_name!: string;
  public display_name!: string | null;
  public group_jid!: string | null;
  public owner_name!: string | null;
  public contact_number!: string | null;
  public address!: string | null;
  public latitude!: number | null;
  public longitude!: number | null;
  public status!: string;
  public is_cng_available!: boolean;
  public price!: number | null;
  public note!: string | null;
  public last_updated!: Date | null;
  public created_by!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
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
