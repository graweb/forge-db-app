import { NextResponse, type NextRequest } from "next/server"

import {
  deleteRoutine,
  getConnectionById,
  getRoutineDetails,
  updateRoutine,
} from "@/lib/connections"
import type { RoutineKind } from "@/types/connections"

export const runtime = "nodejs"

function getQueryParams(request: NextRequest) {
  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") === "function" ? "function" : "procedure"

  return {
    databaseName: url.searchParams.get("databaseName") ?? "",
    schemaName: url.searchParams.get("schemaName") ?? "",
    kind: kind as RoutineKind,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; routineName: string }> }
) {
  try {
    const { connectionId, routineName } = await params
    const connection = getConnectionById(connectionId)

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          message: "Conexão não encontrada.",
          details: "A conexão informada não existe.",
        },
        { status: 404 }
      )
    }

    const { databaseName, schemaName, kind } = getQueryParams(request)
    const result = await getRoutineDetails(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(routineName),
      kind
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao carregar rotina."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível carregar a rotina.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; routineName: string }> }
) {
  try {
    const { connectionId, routineName } = await params
    const connection = getConnectionById(connectionId)

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          message: "Conexão não encontrada.",
          details: "A conexão informada não existe.",
        },
        { status: 404 }
      )
    }

    const body = (await request.json()) as { sql?: string; databaseName?: string; schemaName?: string; kind?: RoutineKind }
    const query = getQueryParams(request)
    const kind = body.kind === "function" || query.kind === "function" ? "function" : "procedure"
    const result = await updateRoutine(
      connection,
      body.databaseName ?? query.databaseName,
      body.schemaName ?? query.schemaName,
      decodeURIComponent(routineName),
      kind,
      body.sql ?? ""
    )

    return NextResponse.json({
      success: true,
      message: "Rotina salva com sucesso.",
      details: `A rotina ${result.routineName} foi atualizada no banco.`,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao salvar rotina."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível salvar a rotina.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; routineName: string }> }
) {
  try {
    const { connectionId, routineName } = await params
    const connection = getConnectionById(connectionId)

    if (!connection) {
      return NextResponse.json(
        {
          success: false,
          message: "Conexão não encontrada.",
          details: "A conexão informada não existe.",
        },
        { status: 404 }
      )
    }

    const { databaseName, schemaName, kind } = getQueryParams(request)
    const result = await deleteRoutine(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(routineName),
      kind
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao excluir rotina."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível excluir a rotina.",
        details: message,
      },
      { status: 400 }
    )
  }
}
