import { eq, and, gt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, users, workspace_members, workspaces } from '../db/schema.js'

export interface AuthUser {
  id: string
  name: string | null
  email: string
  avatar_url: string | null
  role: string
}

export interface AuthWorkspace {
  id: string
  name: string
}

export interface AuthResult {
  user: AuthUser
  workspace: AuthWorkspace
}

export async function getUserFromSessionToken(
  token: string
): Promise<AuthResult | null> {
  const now = new Date()

  const result = await db
    .select({
      user_id: users.id,
      user_name: users.name,
      email: users.email,
      avatar_url: users.avatar_url,
      role: workspace_members.role,
      workspace_id: workspaces.id,
      workspace_name: workspaces.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.user_id, users.id))
    .innerJoin(workspace_members, eq(workspace_members.user_id, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspace_members.workspace_id))
    .where(and(eq(sessions.token, token), gt(sessions.expires_at, now)))
    .limit(1)

  if (result.length === 0) {
    return null
  }

  const row = result[0]
  return {
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.email,
      avatar_url: row.avatar_url,
      role: row.role,
    },
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
    },
  }
}
