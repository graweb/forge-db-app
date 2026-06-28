export type CreateTableColumnInput = {
  name: string
  dataType: string
  size: string
  unsigned?: boolean
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type CreateTableForeignKeyInput = {
  sourceColumn: string
  referencedSchemaName?: string
  referencedTableName: string
  referencedColumnName: string
  onDelete?: string
  onUpdate?: string
}

export type CreateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnInput[]
  foreignKeys?: CreateTableForeignKeyInput[]
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
  unsigned?: boolean
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
  foreignKeys?: CreateTableForeignKeyInput[]
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
