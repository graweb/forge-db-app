import { NextResponse, type NextRequest } from "next/server"

import { createUser, getConnectionById } from "@/lib/connections"
import type { CreateUserInput } from "@/types/connections"

export const runtime = "nodejs"

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

    const body = (await request.json()) as Partial<CreateUserInput>
    const result = await createUser(connection, {
      userName: body.userName ?? "",
      password: body.password ?? "",
      host: body.host ?? "",
      databaseName: body.databaseName ?? "",
      schemaName: body.schemaName ?? "",
      permissions: Array.isArray(body.permissions) ? body.permissions : [],
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      details: result.details,
      userName: result.userName,
      databaseName: result.databaseName,
      schemaName: result.schemaName,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido ao criar usuário."

    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível criar o usuário.",
        details: message,
      },
      { status: 400 }
    )
  }
}
