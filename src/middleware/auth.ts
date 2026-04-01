import { createMiddleware } from 'hono/factory'
import { getCookie, deleteCookie } from 'hono/cookie'
import { eq, and, gt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, users } from '../db/schema.js'

export type AuthVariables = {
  user: {
    id: string
    name: string | null
    email: string
    avatar_url: string | null
  }
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const token = getCookie(c, 'session')

  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const now = new Date()

  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar_url: users.avatar_url,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .where(and(eq(sessions.token, token), gt(sessions.expires_at, now)))
    .limit(1)

  if (result.length === 0) {
    deleteCookie(c, 'session', { path: '/' })
    return c.json({ error: 'Not authenticated' }, 401)
  }

  c.set('user', result[0])
  await next()
})
