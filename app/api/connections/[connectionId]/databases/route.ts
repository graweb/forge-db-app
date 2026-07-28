import { NextResponse, type NextRequest } from "next/server"

import { createDatabase, getConnectionById, getDatabaseStructure } from "@/lib/connections"

export const runtime = "nodejs"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
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

    const databaseStructure = await getDatabaseStructure(connection)

    return NextResponse.json({
      success: true,
      databaseStructure,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao carregar estrutura."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível carregar a estrutura.",
        details: message,
      },
      { status: 400 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params
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
    const result = await createDatabase(connection, {
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
    const message = error instanceof Error ? error.message : "Erro desconhecido ao criar banco de dados."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível criar o banco de dados.",
        details: message,
      },
      { status: 400 }
    )
  }
}
