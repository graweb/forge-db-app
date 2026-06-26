import { NextResponse, type NextRequest } from "next/server"

import { deleteDatabase, getConnectionById, updateDatabase } from "@/lib/connections"

export const runtime = "nodejs"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; databaseName: string }> }
) {
  try {
    const { connectionId, databaseName } = await params
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

    const body = (await request.json()) as {
      databaseName?: string
      charset?: string
    }
    const result = await updateDatabase(connection, decodeURIComponent(databaseName), {
      databaseName: body.databaseName ?? "",
      charset: body.charset ?? "",
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      databaseName: result.databaseName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao atualizar banco de dados."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível atualizar o banco de dados.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string; databaseName: string }> }
) {
  try {
    const { connectionId, databaseName } = await params
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

    const result = await deleteDatabase(connection, decodeURIComponent(databaseName))

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      databaseName: result.databaseName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao excluir banco de dados."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível excluir o banco de dados.",
        details: message,
      },
      { status: 400 }
    )
  }
}
