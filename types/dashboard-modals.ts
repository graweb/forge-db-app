import type {
  DatabaseStructureDatabase,
  SavedConnection,
  TableDetails,
} from "@/types/connections"

export type CreateTableColumnDraft = {
  sourceName?: string
  name: string
  dataType: string
  size: string
  notNull: boolean
  primaryKey: boolean
  autoIncrement: boolean
  defaultValue: string
  comment: string
}

export type CreateTableDraft = {
  schemaName: string
  tableName: string
  comment: string
  columns: CreateTableColumnDraft[]
}

export type CreateTableModalProps = {
  open: boolean
  connection: SavedConnection | null
  mode: "create" | "edit"
  databaseName?: string
  schemaName?: string
  schemaOptions?: string[]
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
