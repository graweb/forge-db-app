export type CreateTableColumnInput = {
  name: string
  dataType: string
  size: string
  unsigned?: boolean
  notNull: boolean
  primaryKey: boolean
  unique?: boolean
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

export type CreateTableIndexInput = {
  name?: string
  columns: string[]
  unique?: boolean
}

export type CreateTableTriggerInput = {
  name?: string
  description?: string
  timing: string
  event: string
  body: string
}

export type CreateTableFunctionInput = {
  name?: string
  description?: string
  parameters?: string
  returnType: string
  body: string
}

export type CreateTableInput = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnInput[]
  foreignKeys?: CreateTableForeignKeyInput[]
  indexes?: CreateTableIndexInput[]
  triggers?: CreateTableTriggerInput[]
  functions?: CreateTableFunctionInput[]
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
  unique?: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type TableIndexDefinition = {
  name: string
  columns: string[]
  unique: boolean
  primaryKey: boolean
}

export type TableTriggerDefinition = {
  name: string
  description: string
  timing: string
  event: string
  body: string
}

export type TableFunctionDefinition = {
  name: string
  description: string
  parameters: string
  returnType: string
  body: string
}

export type TableDetails = {
  databaseName: string
  schemaName: string
  tableName: string
  comment: string
  columns: TableColumnDefinition[]
  foreignKeys: string[]
  indexes: TableIndexDefinition[]
  triggers: TableTriggerDefinition[]
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
  indexes?: CreateTableIndexInput[]
  triggers?: CreateTableTriggerInput[]
  functions?: CreateTableFunctionInput[]
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
