import type {
  DatabaseStructureDatabase,
  SavedConnection,
  TableDetails,
} from "@/types/connections"

export type CreateTableColumnDraft = {
  id?: string
  sourceName?: string
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

export type CreateTableForeignKeyDraft = {
  id?: string
  sourceColumn: string
  referencedSchemaName: string
  referencedTableName: string
  referencedColumnName: string
  onDelete: string
  onUpdate: string
}

export type CreateTableIndexDraft = {
  id?: string
  sourceName?: string
  name: string
  columnName: string
  columns: string[]
  unique: boolean
  primaryKey: boolean
  removable: boolean
}

export type CreateTableDraft = {
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnDraft[]
  foreignKeys: CreateTableForeignKeyDraft[]
  indexes: CreateTableIndexDraft[]
}

export type CreateTableModalProps = {
  open: boolean
  connection: SavedConnection | null
  mode: "create" | "edit"
  databaseName?: string
  schemaName?: string
  schemaOptions?: string[]
  database?: DatabaseStructureDatabase | null
  table?: TableDetails | null
  onOpenChange: (open: boolean) => void
  onSaved: (details: { message: string; details: string }) => void | Promise<void>
}

export type DeleteDatabaseModalProps = {
  open: boolean
  connection: SavedConnection | null
  database: DatabaseStructureDatabase | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void | Promise<void>
}

export type DeleteTableModalProps = {
  open: boolean
  connection: SavedConnection | null
  database: DatabaseStructureDatabase | null
  schemaName?: string
  tableName?: string
  onOpenChange: (open: boolean) => void
  onDeleted: () => void | Promise<void>
}

export type DatabaseModalMode = "create" | "edit"

export type DatabaseDraft = {
  name: string
  charset: string
}

export type DatabaseInfo = {
  name: string
  charset?: string
  collation?: string
  encoding?: string
}

export type DatabaseModalProps = {
  open: boolean
  mode: DatabaseModalMode
  connection: SavedConnection | null
  database?: DatabaseInfo | null
  onOpenChange: (open: boolean) => void
  onSaved: (details: { message: string; details: string }) => void | Promise<void>
}
