import type {
  ConnectionAvailability,
  DatabaseStructure,
  DatabaseStructureDatabase,
  SavedConnection,
} from "@/types/connections"

export type DashboardSidebarProps = {
  activeConnectionId: string | null
  connections: SavedConnection[]
  connectionAvailabilityById: Record<string, ConnectionAvailability>
  databaseStructuresById: Record<string, DatabaseStructure>
  onAddConnection: () => void
  onCreateDatabase: (connection: SavedConnection) => void
  onCreateTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string
  ) => void
  onEditTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void | Promise<void>
  onDeleteTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void
  onSelect100Rows: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void
  onEditDatabase: (connection: SavedConnection, database: DatabaseStructureDatabase) => void
  onDeleteDatabase: (connection: SavedConnection, database: DatabaseStructureDatabase) => void
  onDisconnectConnection: () => void
  onSelectConnection: (connection: SavedConnection) => void
  onEditConnection: (connection: SavedConnection) => void
  onRefreshStructure: () => void
  onRefreshDatabaseStructure: () => void
  onInsertText: (text: string) => void
  onPreviewTable: (tablePath: string) => Promise<void> | void
  onExecuteTable: (tablePath: string) => Promise<void> | void
  onRunTableQuery: (tablePath: string) => Promise<void> | void
}

export type DashboardSidebarActions = {
  connectionAvailabilityById: Record<string, ConnectionAvailability>
  onCreateDatabase: (connection: SavedConnection) => void
  onCreateTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string
  ) => void
  onEditTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void
  onDeleteTable: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void
  onSelect100Rows: (
    connection: SavedConnection,
    database: DatabaseStructureDatabase,
    schemaName: string,
    tableName: string
  ) => void
  onEditDatabase: (connection: SavedConnection, database: DatabaseStructureDatabase) => void
  onDeleteDatabase: (connection: SavedConnection, database: DatabaseStructureDatabase) => void
  onDisconnectConnection: () => void
  onSelectConnection: (connection: SavedConnection) => void
  onEditConnection: (connection: SavedConnection) => void
  onRefreshStructure: () => void
  onRefreshDatabaseStructure: () => void
  onInsertText: (text: string) => void
  onPreviewTable: (tablePath: string) => Promise<void> | void
  onExecuteTable: (tablePath: string) => Promise<void> | void
  onRunTableQuery: (tablePath: string) => Promise<void> | void
}
