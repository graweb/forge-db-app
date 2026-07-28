import { NextResponse, type NextRequest } from "next/server"

import { deleteView, getConnectionById, getViewDetails } from "@/lib/connections"

export const runtime = "nodejs"

function getQueryParams(request: NextRequest) {
  const url = new URL(request.url)
  return {
    databaseName: url.searchParams.get("databaseName") ?? "",
    schemaName: url.searchParams.get("schemaName") ?? "",
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; viewName: string }> }
) {
  try {
    const { connectionId, viewName } = await params
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

    const { databaseName, schemaName } = getQueryParams(request)
    const result = await getViewDetails(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(viewName)
    )

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao carregar view."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível carregar a view.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; viewName: string }> }
) {
  try {
    const { connectionId, viewName } = await params
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

    const { databaseName, schemaName } = getQueryParams(request)
    const result = await deleteView(
      connection,
      databaseName,
      schemaName,
      decodeURIComponent(viewName)
    )

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      viewName: result.viewName,
      schemaName: result.schemaName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao excluir view."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível excluir a view.",
        details: message,
      },
      { status: 400 }
    )
  }
}
