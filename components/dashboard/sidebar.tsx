"use client"

import {
  Eye,
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
import { TreeView } from "@/components/ui/tree-view"

import { getDatabaseLabel } from "@/helpers/dashboard"
import type {
  ConnectionAvailability,
  DatabaseStructure,
  DatabaseStructureDatabase,
  DatabaseStructureGroup,
  SavedConnection,
} from "@/types/connections"
import type { DashboardSidebarActions, DashboardSidebarProps } from "@/types/dashboard-sidebar"
import type { TreeViewNode } from "@/types/ui"

const sectionIcons = {
  Tabelas: Table2,
  Views: Eye,
  Índices: Table2,
  Procedures: Wrench,
  Funções: Sigma,
}

export function DashboardSidebar({
  activeConnectionId,
  connections,
  connectionAvailabilityById,
  databaseStructuresById,
  onAddConnection,
  onCreateDatabase,
  onCreateTable,
  onEditTable,
  onDeleteTable,
  onSelect100Rows,
  onEditDatabase,
  onDeleteDatabase,
  onDisconnectConnection,
  onSelectConnection,
  onEditConnection,
  onRefreshStructure,
  onRefreshDatabaseStructure,
  onInsertText,
  onPreviewTable,
  onExecuteTable,
  onRunTableQuery,
}: DashboardSidebarProps) {
  const treeNodes = buildTreeNodes(connections, activeConnectionId, databaseStructuresById, {
    connectionAvailabilityById,
    onCreateDatabase,
    onCreateTable,
    onEditTable,
    onDeleteTable,
    onSelect100Rows,
    onEditDatabase,
    onDeleteDatabase,
    onDisconnectConnection,
    onSelectConnection,
    onEditConnection,
    onRefreshStructure,
    onRefreshDatabaseStructure,
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
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return connections.map((connection) => {
    const databaseStructure: DatabaseStructure = databaseStructuresById[connection.id] ?? {
      databases: [],
      schemas: [],
      groups: [],
    }
    const firstDatabase: any = databaseStructure.databases[0]
    const primaryDatabase =
      firstDatabase ??
      ({
        name: getDatabaseNodeLabel(connection),
        schemas: databaseStructure.schemas,
        groups: databaseStructure.groups,
        charset: firstDatabase?.charset,
        collation: firstDatabase?.collation,
        encoding: firstDatabase?.encoding,
      } as DatabaseStructureDatabase)
    const availability = actions.connectionAvailabilityById[connection.id]
    const isAvailable = availability?.available !== false
    const canCreateDatabase = isAvailable && connection.databaseType !== "sqlite"
    const connectionSubtitle = getConnectionTreeSubtitle(connection)
    const isActive = connection.id === activeConnectionId

    const childNodes =
      (connection.databaseType === "sqlserver" ||
        connection.databaseType === "mysql" ||
        connection.databaseType === "mariadb") &&
      databaseStructure.databases.length > 0
        ? [
            {
              id: `databases-${connection.id}`,
              label: "Banco de dados",
              icon: FolderGit2,
              defaultExpanded: false,
              contextActions: isAvailable ? (
                <DatabaseNodeContextMenu
                  canCreate={canCreateDatabase}
                  onCreateDatabase={() => actions.onCreateDatabase(connection)}
                  onRefreshStructure={actions.onRefreshStructure}
                />
              ) : null,
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
              contextActions: isAvailable ? (
                <DatabaseItemContextMenu
                  onEditDatabase={() => actions.onEditDatabase(connection, primaryDatabase)}
                  onDeleteDatabase={() => actions.onDeleteDatabase(connection, primaryDatabase)}
                  onRefreshDatabaseStructure={actions.onRefreshDatabaseStructure}
                />
              ) : null,
              children: getSchemaNodes(connection, databaseStructure, actions),
            },
          ]

    return {
      id: `connection-${connection.id}`,
      label: connection.connectionName,
      subtitle: connectionSubtitle,
      icon: Database,
      badge: (
        <Badge
          className={
            isAvailable
              ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border-rose-400/20 bg-rose-400/10 text-rose-300"
          }
        >
          <span
            className={`mr-1 size-1.5 rounded-full ${
              isAvailable ? "bg-emerald-400" : "bg-rose-400"
            }`}
          />
          {isAvailable ? "Online" : "Indisponível"}
        </Badge>
      ),
      defaultExpanded: false,
      expandOnClick: isAvailable,
      unavailable: !isAvailable,
      selected: isActive,
      onSelect: () => actions.onSelectConnection(connection),
      contextActions: (
        <ConnectionTreeContextMenu
          isActive={isActive}
          canConnect={isAvailable}
          onConnect={() => actions.onSelectConnection(connection)}
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
  canConnect,
  onConnect,
  onDisconnect,
  onEdit,
}: {
  isActive: boolean
  canConnect: boolean
  onConnect: () => void
  onDisconnect: () => void
  onEdit: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={isActive || !canConnect} onSelect={onConnect}>
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

function DatabaseNodeContextMenu({
  canCreate,
  onCreateDatabase,
  onRefreshStructure,
}: {
  canCreate: boolean
  onCreateDatabase: () => void
  onRefreshStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem disabled={!canCreate} onSelect={onCreateDatabase}>
        Criar banco de dados
      </ContextMenuItem>
      <ContextMenuItem onSelect={onRefreshStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function DatabaseItemContextMenu({
  onEditDatabase,
  onDeleteDatabase,
  onRefreshDatabaseStructure,
}: {
  onEditDatabase: () => void
  onDeleteDatabase: () => void
  onRefreshDatabaseStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onEditDatabase}>Editar</ContextMenuItem>
      <ContextMenuItem onSelect={onDeleteDatabase}>Excluir</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onRefreshDatabaseStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function TableGroupContextMenu({
  onCreateTable,
  onRefreshStructure,
}: {
  onCreateTable: () => void
  onRefreshStructure: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onCreateTable}>Criar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onRefreshStructure}>Atualizar</ContextMenuItem>
    </div>
  )
}

function buildDatabaseNode(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode {
    return {
      id: `database-${connection.id}-${database.name}`,
      label: database.name,
      icon: Database,
      defaultExpanded: false,
      contextActions: (
        <DatabaseItemContextMenu
          onEditDatabase={() => actions.onEditDatabase(connection, database)}
          onDeleteDatabase={() => actions.onDeleteDatabase(connection, database)}
          onRefreshDatabaseStructure={actions.onRefreshDatabaseStructure}
        />
      ),
      children:
        connection.databaseType === "mysql" || connection.databaseType === "mariadb"
          ? getMySqlLikeDatabaseChildren(connection, database, actions)
          : getSchemaNodesForDatabase(connection, database, actions),
    }
  }

function getSchemaNodes(
  connection: SavedConnection,
  databaseStructure: DatabaseStructure,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return getSchemaNodesForDatabase(connection, {
    name: getDatabaseNodeLabel(connection),
    schemas: databaseStructure.schemas,
    groups: databaseStructure.groups,
  }, actions)
}

function getMySqlLikeDatabaseChildren(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  return sortDatabaseGroups(database.groups).map((group) => buildGroupNode(connection, database, group, actions, database.name))
}

function getSchemaNodesForDatabase(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  actions: DashboardSidebarActions
): TreeViewNode[] {
  const schemas = database.schemas.length
    ? database.schemas
    : [{ name: getDefaultSchemaName(connection), groups: database.groups }]
  const availability = actions.connectionAvailabilityById[connection.id]
  const isAvailable = availability?.available !== false

  return schemas.map((schema) => ({
    id: `schema-${connection.id}-${schema.name}`,
    label: schema.name,
    icon: Layers3,
    defaultExpanded: false,
    children: sortDatabaseGroups(schema.groups).map((group) =>
      buildGroupNode(connection, database, group, actions, schema.name, isAvailable)
    ),
  }))
}

function buildGroupNode(
  connection: SavedConnection,
  database: DatabaseStructureDatabase,
  group: DatabaseStructureGroup,
  actions: DashboardSidebarActions,
  schemaName: string,
  isAvailable = actions.connectionAvailabilityById[connection.id]?.available !== false
): TreeViewNode {
  const Icon = sectionIcons[group.label as keyof typeof sectionIcons] ?? Table2
  const supportsQueryActions = group.label === "Tabelas" || group.label === "Views"
  const isTableGroup = group.label === "Tabelas"

  return {
    id: `${connection.id}-${schemaName}-${group.label}`,
    label: group.label,
    icon: Icon,
    badge: group.items.length,
    defaultExpanded: false,
    contextActions:
      isAvailable && isTableGroup ? (
        <TableGroupContextMenu
          onCreateTable={() => actions.onCreateTable(connection, database, schemaName)}
          onRefreshStructure={actions.onRefreshDatabaseStructure}
        />
      ) : null,
    children: group.items.map((item) => {
      const tableReference = getTableReference(
        connection,
        schemaName,
        item,
        connection.databaseType === "sqlserver" ? database.name : undefined
      )
      const tableSchemaName = connection.databaseType === "sqlite" ? "main" : schemaName
      const tableName = item

      return {
        id: `${connection.id}-${schemaName}-${group.label}-${item}`,
        label: item,
        icon: FileCode2,
        isLeaf: true,
        onDoubleClick: isTableGroup ? () => void actions.onRunTableQuery(tableReference) : undefined,
        contextActions: isTableGroup ? (
          <TableItemContextMenu
            onCreateTable={() => actions.onCreateTable(connection, database, schemaName)}
            onEditTable={() => actions.onEditTable(connection, database, tableSchemaName, tableName)}
            onDeleteTable={() =>
              actions.onDeleteTable(connection, database, tableSchemaName, tableName)
            }
            onSelect100Rows={() =>
              actions.onSelect100Rows(connection, database, tableSchemaName, tableName)
            }
          />
        ) : (
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

function TableItemContextMenu({
  onCreateTable,
  onEditTable,
  onDeleteTable,
  onSelect100Rows,
}: {
  onCreateTable: () => void
  onEditTable: () => void
  onDeleteTable: () => void
  onSelect100Rows: () => void
}) {
  return (
    <div className="min-w-52 p-1">
      <ContextMenuItem onSelect={onCreateTable}>Criar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onEditTable}>Editar tabela</ContextMenuItem>
      <ContextMenuItem onSelect={onDeleteTable}>Excluir tabela</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onSelect100Rows}>Selecionar 100 linhas</ContextMenuItem>
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

function sortDatabaseGroups(groups: DatabaseStructureGroup[]) {
  const order = ["Tabelas", "Views", "Índices", "Procedures", "Funções"]

  return [...groups].sort((left, right) => {
    const leftIndex = order.indexOf(left.label)
    const rightIndex = order.indexOf(right.label)

    const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
    const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex

    if (normalizedLeft !== normalizedRight) {
      return normalizedLeft - normalizedRight
    }

    return left.label.localeCompare(right.label, "pt-BR")
  })
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
