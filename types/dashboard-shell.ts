import type { DatabaseStructure, DatabaseStructureDatabase, SavedConnection } from "@/types/connections"

export type DashboardShellProps = {
  connection: SavedConnection | null
  connections: SavedConnection[]
  connectionAvailabilityById: Record<string, { available: boolean; message?: string }>
  databaseStructure?: DatabaseStructure
  databaseStructuresById: Record<string, DatabaseStructure>
}

export type ShellNotice = {
  title: string
  message: string
}

export type TableTarget = {
  connection: SavedConnection
  database: DatabaseStructureDatabase
  schemaName: string
  tableName: string
  comment: string
  columns: Array<{
    name: string
    dataType: string
    size: string
    notNull: boolean
    primaryKey: boolean
    autoIncrement: boolean
    defaultValue: string
    comment: string
  }>
  foreignKeys: string[]
  indexes: string[]
  triggers: string[]
  functions: string[]
}
