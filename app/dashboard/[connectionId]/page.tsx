import { notFound } from "next/navigation"

import { DashboardShell } from "@/components/dashboard/shell"
import {
  getDatabaseStructureLoadResult,
  getConnectionById,
  listConnections,
  type ConnectionAvailability,
} from "@/lib/connections"

export const runtime = "nodejs"

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ connectionId: string }>
}) {
  const { connectionId } = await params
  const connection = getConnectionById(connectionId)

  if (!connection) {
    notFound()
  }

  const connections = listConnections(100)
  const loadedStructures = await Promise.all(
    connections.map(async (item) => [item.id, await getDatabaseStructureLoadResult(item)] as const)
  )
  const databaseStructuresById = Object.fromEntries(
    loadedStructures.map(([id, result]) => [id, result.databaseStructure] as const)
  )
  const connectionAvailabilityById = Object.fromEntries(
    loadedStructures.map(([id, result]) => [id, result.connectionAvailability] as const)
  ) as Record<string, ConnectionAvailability>
  const databaseStructure =
    databaseStructuresById[connection.id] ?? (await getDatabaseStructureLoadResult(connection)).databaseStructure

  return (
    <DashboardShell
      connection={connection}
      connections={connections}
      connectionAvailabilityById={connectionAvailabilityById}
      databaseStructure={databaseStructure}
      databaseStructuresById={databaseStructuresById}
    />
  )
}
