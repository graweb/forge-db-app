export type CreateTableColumnInput = {
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type CreateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnInput[]
}

export type CreateTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
}

export type TableColumnDefinition = {
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type TableDetails = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: TableColumnDefinition[]
  foreignKeys: string[]
  indexes: string[]
  triggers: string[]
  functions: string[]
}

export type UpdateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  nextTableName: string
  columns: Array<TableColumnDefinition & { sourceName?: string }>
  comment: string
}

export type UpdateTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
}

export type DeleteTableResult = {
  message: string
  details: string
  tableName: string
  schemaName: string
}
