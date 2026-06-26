"use client"

import {
  Clock3,
  Database,
  FileCode2,
  FolderGit2,
  Layers3,
  Plus,
  Sigma,
  Table2,
  Wrench,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu"
import { TreeView, type TreeViewNode } from "@/components/ui/tree-view"

import { getDatabaseLabel } from "./shared"
import type { DatabaseStructure, DatabaseStructureDatabase, SavedConnection } from "@/lib/connections"

type DashboardSidebarProps = {
  activeConnectionId: string | null
  connections: SavedConnection[]
  databaseStructuresById: Record<string, DatabaseStructure>
  onAddConnection: () => void
  onDisconnectConnection: () => void
  onSelectConnection: (connectionId: string) => void
  onEditConnection: (connection: SavedConnection) => void
  onInsertText: (text: string) => void
  onPreviewTable: (tablePath: string) => Promise<void> | void
  onExecuteTable: (tablePath: string) => Promise<void> | void
  onRunTableQuery: (tablePath: string) => Promise<void> | void
}

const sectionIcons = {
  Tabelas: Table2,
  Views: Clock3,
  Índices: Table2,
  Funções: Sigma,
  Procedures: Wrench,
}

export function DashboardSidebar({
  activeConnectionId,
  connections,
  databaseStructuresById,
  onAddConnection,
  onDisconnectConnection,
  onSelectConnection,
  onEditConnection,
  onInsertText,
  onPreviewTable,
  onExecuteTable,
  onRunTableQuery,
}: DashboardSidebarProps) {
  const treeNodes = buildTreeNodes(connections, activeConnectionId, databaseStructuresById, {
    onDisconnectConnection,
    onSelectConnection,
    onEditConnection,
    onInsertText,
    onPreviewTable,
    onExecuteTable,
    onRunTableQuery,
  })

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#07111d]/95">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <Button
            type="button"
            size="sm"
            onClick={onAddConnection}
            className="w-full justify-start gap-2 border border-white/10 bg-white/4 text-white hover:bg-white/8"
            variant="outline"
          >
            <Plus className="size-4" />
            Adicionar conexão
          </Button>

          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/40">
            <span>Estrutura</span>
            <Badge className="border-white/10 bg-white/5 text-white/65">live</Badge>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/2 p-2">
            <TreeView nodes={treeNodes} />
          </div>
        </section>
      </div>
    </aside>
  )
}

function buildTreeNodes(
  connections: SavedConnection[],
  activeConnectionId: string | null,
  databaseStructuresById: Record<string, DatabaseStructure>,
  actions: {
    onDisconnectConnection: () => void
    onSelectConnection: (connectionId: string) => void
    onEditConnection: (connection: SavedConnection) => void
    onInsertText: (text: string) => void
    onPreviewTable: (tablePath: string) => Promise<void> | void
    onExecuteTable: (tablePath: string) => Promise<void> | void
    onRunTableQuery: (tablePath: string) => Promise<void> | void
  }
): TreeViewNode[] {
  return connections.map((connection) => {
    const databaseStructure = databaseStructuresById[connection.id] ?? {
      databases: [],
      schemas: [],
      groups: [],
    }
    const connectionSubtitle = getConnectionTreeSubtitle(connection)
    const isActive = connection.id === activeConnectionId

    const childNodes =
      connection.databaseType === "sqlserver" && databaseStructure.databases.length > 0
        ? [
            {
              id: `databases-${connection.id}`,
              label: "Banco de dados",
              icon: FolderGit2,
              defaultExpanded: false,
              children: databaseStructure.databases.map((database) =>
                buildDatabaseNode(connection, database, actions)
              ),
            },
          ]
        : [
            {
              id: `database-${connection.id}`,
              label: getDatabaseNodeLabel(connection),
              icon: FolderGit2,
              defaultExpanded: false,
              children: getSchemaNodes(connection, databaseStructure, actions),
            },
          ]

    return {
      id: `connection-${connection.id}`,
      label: connection.connectionName,
      subtitle: connectionSubtitle,
      icon: Database,
      defaultExpanded: false,
      selected: isActive,
      onSelect: () => actions.onSelectConnection(connection.id),
      contextActions: (
        <ConnectionTreeContextMenu
          isActive={isActive}
          onConnect={() => actions.onSelectConnection(connection.id)}
          onDisconnect={actions.onDisconnectConnection}
          onEdit={() => actions.onEditConnection(connection)}
        />
      ),
      children: childNodes,
    }
  })
}

function ConnectionTreeContextMenu({
  isActive,
  onConnect,
  onDisconnect,
  onEdit,
}: {
  isActive: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={isActive} onSelect={onConnect}>
        Conectar
      </ContextMenuItem>
      <ContextMenuItem disabled={!isActive} onSelect={onDisconnect}>
        Desconectar
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onEdit}>Editar</ContextMenuItem>
    </div>
  )
}

function buildDatabaseNode(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: {
    onDisconnectConnection: () => void
    onInsertText: (text: string) => void
    onPreviewTable: (tablePath: string) => Promise<void> | void
    onExecuteTable: (tablePath: string) => Promise<void> | void
    onRunTableQuery: (tablePath: string) => Promise<void> | void
  }
): TreeViewNode {
  return {
    id: `database-${connection.id}-${database.name}`,
    label: database.name,
    icon: Database,
    defaultExpanded: false,
    children: getSchemaNodesForDatabase(connection, database, actions),
  }
}

function getSchemaNodes(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure,
  actions: {
    onDisconnectConnection: () => void
    onInsertText: (text: string) => void
    onPreviewTable: (tablePath: string) => Promise<void> | void
    onExecuteTable: (tablePath: string) => Promise<void> | void
    onRunTableQuery: (tablePath: string) => Promise<void> | void
  }
): TreeViewNode[] {
  return getSchemaNodesForDatabase(connection, {
    name: getDatabaseNodeLabel(connection),
    schemas: databaseStructure.schemas,
    groups: databaseStructure.groups,
  }, actions)
}

function getSchemaNodesForDatabase(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: {
    onDisconnectConnection: () => void
    onInsertText: (text: string) => void
    onPreviewTable: (tablePath: string) => Promise<void> | void
    onExecuteTable: (tablePath: string) => Promise<void> | void
    onRunTableQuery: (tablePath: string) => Promise<void> | void
  }
): TreeViewNode[] {
  const schemas = database.schemas.length
    ? database.schemas
    : [{ name: getDefaultSchemaName(connection), groups: database.groups }]

  return schemas.map((schema) => ({
    id: `schema-${connection.id}-${schema.name}`,
    label: schema.name,
    icon: Layers3,
    defaultExpanded: false,
    children: schema.groups.map((group) => {
      const Icon = sectionIcons[group.label as keyof typeof sectionIcons] ?? Table2
      const supportsQueryActions = group.label === "Tabelas" || group.label === "Views"
      const isTableGroup = group.label === "Tabelas"

      return {
        id: `${connection.id}-${schema.name}-${group.label}`,
        label: group.label,
        icon: Icon,
        badge: group.items.length,
        defaultExpanded: false,
        children: group.items.map((item) => {
          const tableReference = getTableReference(
            connection,
            schema.name,
            item,
            connection.databaseType === "sqlserver" ? database.name : undefined
          )

          return {
            id: `${connection.id}-${schema.name}-${group.label}-${item}`,
            label: item,
            icon: FileCode2,
            isLeaf: true,
            onDoubleClick: isTableGroup ? () => void actions.onRunTableQuery(tableReference) : undefined,
            contextActions: (
              <TreeContextMenu
                objectPath={tableReference}
                onInsertText={() => actions.onInsertText(`SELECT *\nFROM ${tableReference};`)}
                onPreviewTable={() => void actions.onPreviewTable(tableReference)}
                onExecuteTable={() => void actions.onExecuteTable(tableReference)}
                supportsQueryActions={supportsQueryActions}
              />
            ),
          }
        }),
      }
    }),
  }))
}

function TreeContextMenu({
  objectPath,
  onInsertText,
  onPreviewTable,
  onExecuteTable,
  supportsQueryActions,
}: {
  objectPath: string
  onInsertText: () => void
  onPreviewTable: () => void
  onExecuteTable: () => void
  supportsQueryActions: boolean
}) {
  return (
    <div className="p-1">
      <ContextMenuItem onSelect={onInsertText}>Inserir {objectPath}</ContextMenuItem>
      {supportsQueryActions ? (
        <>
          <ContextMenuItem onSelect={onPreviewTable}>Pré-visualizar {objectPath}</ContextMenuItem>
          <ContextMenuItem onSelect={onExecuteTable}>Executar {objectPath}</ContextMenuItem>
        </>
      ) : null}
    </div>
  )
}

function getDatabaseNodeLabel(connection: SavedConnection) {
  const label = getDatabaseLabel(connection.databaseType)

  if (connection.databaseType === "sqlite") {
    return label
  }

  const databaseName = connection.databaseName.trim()
  return databaseName ? `${label}: ${databaseName}` : label
}

function getConnectionTreeSubtitle(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return connection.databaseFile.trim() || "SQLite local"
  }

  const host = connection.host.trim() || "localhost"
  const port = connection.port.trim()
  return port ? `${host}:${port}` : host
}

function getDefaultSchemaName(connection: SavedConnection) {
  if (connection.databaseType === "sqlite") {
    return "main"
  }

  return connection.databaseName.trim() || "schema_1"
}

function getTableReference(
  connection: SavedConnection,
  schemaName: string,
  tableName: string,
  databaseName?: string
) {
  const normalizedSchema = schemaName.trim()
  const normalizedTable = tableName.trim()
  const normalizedDatabase = databaseName?.trim() ?? ""

  if (!normalizedSchema || !normalizedTable) {
    return normalizedTable || normalizedSchema
  }

  if (connection.databaseType === "sqlite" && normalizedSchema === "main") {
    return normalizedTable
  }

  if (connection.databaseType === "postgresql" && normalizedSchema === "public") {
    return normalizedTable
  }

  if (connection.databaseType === "sqlserver") {
    const qualifiedDatabase = normalizedDatabase ? formatSqlServerIdentifier(normalizedDatabase) : ""
    const qualifiedSchema = formatSqlServerIdentifier(normalizedSchema)
    const qualifiedTable = formatSqlServerIdentifier(normalizedTable)

    if (!qualifiedDatabase) {
      return `${qualifiedSchema}.${qualifiedTable}`
    }

    return `${qualifiedDatabase}.${qualifiedSchema}.${qualifiedTable}`
  }

  if (
    (connection.databaseType === "mysql" || connection.databaseType === "mariadb") &&
    normalizedSchema === connection.databaseName.trim()
  ) {
    return normalizedTable
  }

  return `${normalizedSchema}.${normalizedTable}`
}

function formatSqlServerIdentifier(value: string) {
  if (!value) {
    return value
  }

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    return value
  }

  return `[${value.replace(/\]/g, "]]")}]`
}
