export type DatabaseType = "mysql" | "mariadb" | "postgresql" | "sqlserver" | "sqlite"

export type ConnectionInput = {
  databaseType: DatabaseType
  connectionName: string
  host: string
  port: string
  user: string
  password: string
  databaseName: string
  databaseFile: string
  additional: string
  useSsl: boolean
}

export type TestConnectionResult = {
  message: string
  details: string
}

export type CreateUserInput = {
  userName: string
  password: string
  host?: string
  databaseName?: string
  schemaName?: string
  permissions: string[]
}

export type CreateUserResult = {
  message: string
  details: string
  userName: string
  databaseName?: string
  schemaName?: string
}

export type SerializedValue = string | number | boolean | null

export type QueryExecutionResult = {
  columns: string[]
  rows: Array<Record<string, SerializedValue>>
  rowCount: number
  affectedRows?: number
  message: string
}

export type ConnectionAvailability = {
  available: boolean
  message?: string
}

export type DatabaseStructureGroup = {
  label: string
  items: string[]
  columnsByItem?: Record<string, string[]>
  columnsDetailsByItem?: Record<
    string,
    Array<{
      name: string
      dataType: string
      size: string
      unsigned?: boolean
      primaryKey?: boolean
    }>
  >
}

export type DatabaseStructureSchema = {
  name: string
  groups: DatabaseStructureGroup[]
}

export type DatabaseStructureDatabase = {
  name: string
  schemas: DatabaseStructureSchema[]
  groups: DatabaseStructureGroup[]
  charset?: string
  collation?: string
  encoding?: string
}

export type DatabaseStructure = {
  databases: DatabaseStructureDatabase[]
  schemas: DatabaseStructureSchema[]
  groups: DatabaseStructureGroup[]
  users: string[]
}

export type SavedConnection = ConnectionInput & {
  id: string
  createdAt: string
  updatedAt: string
}

export type DatabaseStructureLoadResult = {
  databaseStructure: DatabaseStructure
  connectionAvailability: ConnectionAvailability
}
