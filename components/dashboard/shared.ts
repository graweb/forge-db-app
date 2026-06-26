import {
  Code2,
  Database,
  FileStack,
  HardDrive,
  Server,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react"

import type { DatabaseType, SavedConnection } from "@/lib/connections"

export const databaseIcons: Record<DatabaseType, LucideIcon> = {
  mysql: Database,
  mariadb: Server,
  postgresql: HardDrive,
  sqlserver: FileStack,
  sqlite: Code2,
}

export function getDatabaseIcon(databaseType: DatabaseType): LucideIcon {
  return databaseIcons[databaseType] ?? SquareTerminal
}

export function getConnectionSubtitle(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return connection.databaseFile || "SQLite local"
  }

  return `${connection.user}@${connection.host}:${connection.port}`
}

export function getDatabaseLabel(databaseType: DatabaseType) {
  switch (databaseType) {
    case "mysql":
      return "MySQL"
    case "mariadb":
      return "MariaDB"
    case "postgresql":
      return "PostgreSQL"
    case "sqlserver":
      return "SQL Server"
    case "sqlite":
      return "SQLite"
  }
}
