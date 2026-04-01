import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { eq, and, gt } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { db } from '../db/index.js'
import { users, sessions } from '../db/schema.js'
import { getGoogleAuthURL, getGoogleTokens, getGoogleUser } from '../lib/google.js'

const authRoutes = new Hono()

authRoutes.get('/google', (c) => {
  const state = randomBytes(16).toString('hex')

  setCookie(c, 'oauth_state', state, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  })

  return c.redirect(getGoogleAuthURL(state), 302)
})

authRoutes.get('/google/callback', async (c) => {
  const { code, state } = c.req.query()
  const oauthState = getCookie(c, 'oauth_state')

  if (!state || !oauthState || state !== oauthState) {
    return c.json({ error: 'Invalid state' }, 400)
  }

  deleteCookie(c, 'oauth_state', { path: '/' })

  if (!code) {
    return c.json({ error: 'Missing authorization code' }, 400)
  }

  const tokens = await getGoogleTokens(code)
  const googleUser = await getGoogleUser(tokens.access_token)

  // Upsert user
  const [user] = await db
    .insert(users)
    .values({
      email: googleUser.email,
      name: googleUser.name,
      avatar_url: googleUser.picture,
      google_id: googleUser.id,
    })
    .onConflictDoUpdate({
      target: users.google_id,
      set: {
        name: googleUser.name,
        avatar_url: googleUser.picture,
        updated_at: new Date(),
      },
    })
    .returning()

  // Create session
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await db.insert(sessions).values({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  })

  const isProduction = process.env.NODE_ENV === 'production'

  setCookie(c, 'session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
    secure: isProduction,
  })

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  return c.redirect(`${frontendUrl}/requests`, 302)
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, 'session')

  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token))
  }

  deleteCookie(c, 'session', { path: '/' })

  return c.json({ success: true })
})

authRoutes.get('/me', async (c) => {
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

  return c.json({ user: result[0] })
})

export default authRoutes
