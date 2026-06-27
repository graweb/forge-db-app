export type CreateDatabaseInput = {
  databaseName: string
  charset: string
}

export type CreateDatabaseResult = {
  message: string
  details: string
  databaseName: string
}

export type UpdateDatabaseInput = {
  databaseName: string
  charset: string
}

export type UpdateDatabaseResult = {
  message: string
  details: string
  databaseName: string
}

export type DeleteDatabaseResult = {
  message: string
  details: string
  databaseName: string
}
