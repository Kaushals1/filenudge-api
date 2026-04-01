import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL!

export const sql = postgres(connectionString)
export const db = drizzle(sql, { schema })
