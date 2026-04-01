import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'
import authRoutes from './routes/auth.js'
import { authMiddleware, type AuthVariables } from './middleware/auth.js'

const app = new Hono<{ Variables: AuthVariables }>()

const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

app.use('*', logger())
app.use(
  '*',
  cors({
    origin: frontendUrl,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
)

app.route('/auth', authRoutes)

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/*', authMiddleware)
app.get('/api/test', (c) => {
  const user = c.get('user')
  const workspaceId = c.get('workspace_id')
  return c.json({ user, workspace_id: workspaceId })
})

const port = parseInt(process.env.PORT || '8000')
console.log(`FileNudge API running on http://localhost:${port}`)

serve({ fetch: app.fetch, port })
