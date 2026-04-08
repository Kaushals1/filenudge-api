import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, ilike, or, desc, asc, sql, count } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import {
  createClientSchema,
  updateClientSchema,
  csvImportSchema,
} from "../lib/validators/client.js";
import { notFound, conflict, badRequest } from "../lib/errors.js";
import type { AuthVariables } from "../middleware/auth.js";

const clientRoutes = new Hono<{ Variables: AuthVariables }>();

clientRoutes.get("/", async (c) => {
  const workspaceId = c.get("workspace_id");

  const search = c.req.query("search") || "";
  const archived = c.req.query("archived") === "true";
  const sort = (c.req.query("sort") as "name" | "created_at" | "updated_at") || "name";
  const order = c.req.query("order") === "desc" ? "desc" : "asc";
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const offset = (page - 1) * limit;

  const conditions = [eq(clients.workspace_id, workspaceId), eq(clients.is_archived, archived)];

  if (search) {
    const searchPattern = `%${search}%`;
    conditions.push(
      or(
        ilike(clients.name, searchPattern),
        ilike(clients.email, searchPattern),
        ilike(clients.phone, searchPattern)
      )!
    );
  }

  const orderColumn = sort === "name" ? clients.name : sort === "created_at" ? clients.created_at : clients.updated_at;
  const orderDirection = order === "desc" ? desc : asc;

  const [clientsResult, countResult] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(...conditions))
      .orderBy(orderDirection(orderColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(clients)
      .where(and(...conditions)),
  ]);

  const total = countResult[0]?.total || 0;

  const formattedClients = clientsResult.map((client) => ({
    ...client,
    requests_count: 0, // TODO: join with requests table to get actual count
  }));

  return c.json({
    clients: formattedClients,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
});

clientRoutes.get("/:id", async (c) => {
  const workspaceId = c.get("workspace_id");
  const clientId = c.req.param("id");

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .limit(1);

  if (!client) {
    return notFound(c, "Client not found");
  }

  return c.json({
    ...client,
    requests_count: 0,
  });
});

clientRoutes.post("/", zValidator("json", createClientSchema), async (c) => {
  const workspaceId = c.get("workspace_id");
  const body = c.req.valid("json");

  const existingByPhone = body.phone
    ? await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.workspace_id, workspaceId),
            eq(clients.phone, body.phone),
            eq(clients.is_archived, false)
          )
        )
        .limit(1)
    : [];

  if (existingByPhone.length > 0) {
    return conflict(c, "A client with this phone number already exists");
  }

  const existingByEmail = body.email
    ? await db
        .select()
        .from(clients)
        .where(
          and(
            eq(clients.workspace_id, workspaceId),
            eq(clients.email, body.email!),
            eq(clients.is_archived, false)
          )
        )
        .limit(1)
    : [];

  if (existingByEmail.length > 0) {
    return conflict(c, "A client with this email already exists");
  }

  const [newClient] = await db
    .insert(clients)
    .values({
      workspace_id: workspaceId,
      name: body.name,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company_name: body.company_name ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json(newClient, 201);
});

clientRoutes.patch("/:id", zValidator("json", updateClientSchema), async (c) => {
  const workspaceId = c.get("workspace_id");
  const clientId = c.req.param("id");
  const body = c.req.valid("json");

  const [existingClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .limit(1);

  if (!existingClient) {
    return notFound(c, "Client not found");
  }

  if (body.phone && body.phone !== existingClient.phone) {
    const existingByPhone = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspace_id, workspaceId),
          eq(clients.phone, body.phone),
          eq(clients.is_archived, false)
        )
      )
      .limit(1);

    if (existingByPhone.length > 0) {
      return conflict(c, "A client with this phone number already exists");
    }
  }

  if (body.email && body.email !== existingClient.email) {
    const existingByEmail = await db
      .select()
      .from(clients)
      .where(
        and(
          eq(clients.workspace_id, workspaceId),
          eq(clients.email, body.email!),
          eq(clients.is_archived, false)
        )
      )
      .limit(1);

    if (existingByEmail.length > 0) {
      return conflict(c, "A client with this email already exists");
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.company_name !== undefined) updateData.company_name = body.company_name;
  if (body.notes !== undefined) updateData.notes = body.notes;

  const [updatedClient] = await db
    .update(clients)
    .set(updateData)
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .returning();

  return c.json(updatedClient);
});

clientRoutes.delete("/:id", async (c) => {
  const workspaceId = c.get("workspace_id");
  const clientId = c.req.param("id");

  const [existingClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .limit(1);

  if (!existingClient) {
    return notFound(c, "Client not found");
  }

  if (existingClient.is_archived) {
    return badRequest(c, "Client is already archived");
  }

  await db
    .update(clients)
    .set({ is_archived: true, updated_at: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)));

  return c.json({ success: true, message: "Client archived" });
});

clientRoutes.post("/:id/restore", async (c) => {
  const workspaceId = c.get("workspace_id");
  const clientId = c.req.param("id");

  const [existingClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .limit(1);

  if (!existingClient) {
    return notFound(c, "Client not found");
  }

  if (!existingClient.is_archived) {
    return badRequest(c, "Client is not archived");
  }

  const [restoredClient] = await db
    .update(clients)
    .set({ is_archived: false, updated_at: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.workspace_id, workspaceId)))
    .returning();

  return c.json(restoredClient);
});

clientRoutes.post("/import", zValidator("json", csvImportSchema), async (c) => {
  const workspaceId = c.get("workspace_id");
  const body = c.req.valid("json");

  const created: typeof clients.$inferSelect[] = [];
  const skippedDetails: { name: string; reason: string }[] = [];

  await db.transaction(async (tx) => {
    for (const clientData of body.clients) {
      let shouldSkip = false;
      let skipReason = "";

      if (clientData.phone) {
        const [existingByPhone] = await tx
          .select()
          .from(clients)
          .where(
            and(
              eq(clients.workspace_id, workspaceId),
              eq(clients.phone, clientData.phone),
              eq(clients.is_archived, false)
            )
          )
          .limit(1);

        if (existingByPhone) {
          shouldSkip = true;
          skipReason = `Phone ${clientData.phone} already exists`;
        }
      }

      if (!shouldSkip && clientData.email) {
        const [existingByEmail] = await tx
          .select()
          .from(clients)
          .where(
            and(
              eq(clients.workspace_id, workspaceId),
              eq(clients.email, clientData.email),
              eq(clients.is_archived, false)
            )
          )
          .limit(1);

        if (existingByEmail) {
          shouldSkip = true;
          skipReason = `Email ${clientData.email} already exists`;
        }
      }

      if (shouldSkip) {
        skippedDetails.push({ name: clientData.name, reason: skipReason });
      } else {
        const [newClient] = await tx
          .insert(clients)
          .values({
            workspace_id: workspaceId,
            name: clientData.name,
            email: clientData.email ?? null,
            phone: clientData.phone ?? null,
            company_name: clientData.company_name ?? null,
          })
          .returning();
        created.push(newClient);
      }
    }
  });

  return c.json({
    created: created.length,
    skipped: skippedDetails.length,
    skipped_details: skippedDetails,
    total: body.clients.length,
  });
});

export default clientRoutes;
