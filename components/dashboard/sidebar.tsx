"use client"

import {
  Clock3,
  CornerDownRight,
  Database,
  FileCode2,
  FolderGit2,
  Layers3,
  LogOut,
  MoreHorizontal,
  Plus,
  Sigma,
  Table2,
  Wrench,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { TreeView, type TreeViewNode } from "@/components/ui/tree-view"
import { cn } from "@/lib/utils"

import { databaseIcons, getConnectionSubtitle, getDatabaseLabel } from "./shared"
import type {
  DatabaseStructure,
  DatabaseStructureDatabase,
  SavedConnection,
} from "@/lib/connections"

type DashboardSidebarProps = {
  connection: SavedConnection
  recentConnections: SavedConnection[]
  databaseStructure: DatabaseStructure
  onDisconnectConnection: () => void
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
  connection,
  recentConnections,
  databaseStructure,
  onDisconnectConnection,
  onInsertText,
  onPreviewTable,
  onExecuteTable,
  onRunTableQuery,
}: DashboardSidebarProps) {
  const treeNodes = buildTreeNodes(connection, databaseStructure, {
    onDisconnectConnection,
    onInsertText,
    onPreviewTable,
    onExecuteTable,
    onRunTableQuery,
  })

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-white/10 bg-[#07111d]/95">
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <section className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-white/40">
            <span>Conexões</span>
            <Plus className="size-4 text-white/35" />
          </div>
          <div className="space-y-2">
            {recentConnections.map((item) => {
              const Icon = databaseIcons[item.databaseType]
              const active = item.id === connection.id

              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    active
                      ? "border-sky-400/25 bg-sky-400/10"
                      : "border-white/8 bg-white/2 hover:bg-white/4"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg",
                      active ? "bg-sky-400/18 text-sky-300" : "bg-white/6 text-white/65"
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white">{item.connectionName}</div>
                    <div className="truncate text-xs text-white/45">
                      {getConnectionSubtitle(item)}
                    </div>
                  </div>
                  <MoreHorizontal className="size-4 text-white/25" />
                </div>
              )
            })}
          </div>
        </section>

        <section className="space-y-3">
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
  if (connection.databaseType === "sqlserver" && databaseStructure.databases.length > 0) {
    return [
      {
        id: `connection-${connection.id}`,
        label: connection.connectionName,
        icon: Database,
        defaultExpanded: true,
        actions: (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              actions.onDisconnectConnection()
            }}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-white/45 transition-colors hover:bg-rose-400/10 hover:text-rose-200"
            aria-label="Desconectar conexão"
            title="Desconectar conexão"
          >
            <LogOut className="size-3.5" />
          </button>
        ),
        children: [
          {
            id: `databases-${connection.id}`,
            label: "Banco de dados",
            icon: FolderGit2,
            defaultExpanded: true,
            children: databaseStructure.databases.map((database) =>
              buildDatabaseNode(connection, database, actions)
            ),
          },
        ],
      },
    ]
  }

  const databaseNodeLabel = getDatabaseNodeLabel(connection)
  const schemaNodes = getSchemaNodes(connection, databaseStructure, actions)

  return [
    {
      id: `connection-${connection.id}`,
      label: connection.connectionName,
      icon: Database,
      defaultExpanded: true,
      actions: (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            actions.onDisconnectConnection()
          }}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-white/45 transition-colors hover:bg-rose-400/10 hover:text-rose-200"
          aria-label="Desconectar conexão"
          title="Desconectar conexão"
        >
          <LogOut className="size-3.5" />
        </button>
      ),
      children: [
        {
          id: `database-${connection.id}`,
          label: databaseNodeLabel,
          icon: FolderGit2,
          defaultExpanded: true,
          children: schemaNodes,
        },
      ],
    },
  ]
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
    defaultExpanded: true,
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
    defaultExpanded: true,
        children: schema.groups.map((group) => {
      const Icon = sectionIcons[group.label as keyof typeof sectionIcons] ?? Table2
      const supportsQueryActions = group.label === "Tabelas" || group.label === "Views"
      const isTableGroup = group.label === "Tabelas"

      return {
        id: `${connection.id}-${schema.name}-${group.label}`,
        label: group.label,
        icon: Icon,
        badge: group.items.length,
        defaultExpanded: true,
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
    <div className="space-y-1 p-1">
      <ContextMenuItem label={`Inserir ${objectPath}`} onClick={onInsertText} />
      {supportsQueryActions ? (
        <>
          <ContextMenuItem label={`Pré-visualizar ${objectPath}`} onClick={onPreviewTable} />
          <ContextMenuItem label={`Executar ${objectPath}`} onClick={onExecuteTable} />
        </>
      ) : null}
    </div>
  )
}

function ContextMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/75 transition-colors hover:bg-white/8 hover:text-white"
    >
      <CornerDownRight className="size-3.5 text-white/35" />
      <span className="truncate">{label}</span>
    </button>
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
