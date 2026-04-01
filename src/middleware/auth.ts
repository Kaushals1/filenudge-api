import { createMiddleware } from 'hono/factory'
import { getCookie, deleteCookie } from 'hono/cookie'
import { getUserFromSessionToken } from '../lib/auth-utils.js'

export type AuthVariables = {
  user: {
    id: string
    name: string | null
    email: string
    avatar_url: string | null
    role: string
  }
  workspace_id: string
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const token = getCookie(c, 'session')

  if (!token) {
    return c.json({ error: 'Not authenticated' }, 401)
  }

  const result = await getUserFromSessionToken(token)

  if (!result) {
    deleteCookie(c, 'session', { path: '/' })
    return c.json({ error: 'Not authenticated' }, 401)
  }

  c.set('user', result.user)
  c.set('workspace_id', result.workspace.id)
  await next()
})
