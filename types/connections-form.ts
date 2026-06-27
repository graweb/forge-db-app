import type { DatabaseType, SavedConnection } from "@/types/connections-core"

export type ConnectionForm = {
  connectionName: string
  databaseName: string
  databaseFile: string
  host: string
  port: string
  user: string
  password: string
  additional: string
}

export type TestResult =
  | {
      status: "error"
      message: string
      details: string
      durationMs: number
    }
  | {
      status: "success"
      message: string
      details: string
      durationMs: number
    }

export type ConnectionModalProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  mode?: "create" | "edit"
  connectionId?: string
  initialValues?: Partial<ConnectionForm> & {
    databaseType?: DatabaseType
    useSsl?: boolean
  }
  onSaved?: () => void | Promise<void>
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
