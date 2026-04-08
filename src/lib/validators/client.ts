import { z } from "zod";

const clientFields = {
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email").max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  company_name: z.string().max(255).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
};

export const createClientSchema = z
  .object(clientFields)
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone is required",
  });

export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email("Invalid email").max(255).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  company_name: z.string().max(255).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const csvImportClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").nullable().optional(),
  phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
});

export const csvImportSchema = z
  .object({
    clients: z
      .array(
        csvImportClientSchema.refine(
          (data) => data.email || data.phone,
          { message: "Either email or phone is required" }
        )
      )
      .min(1, "At least one client is required")
      .max(500, "Maximum 500 clients per import"),
  })
  .refine((data) => data.clients.length > 0, {
    message: "At least one client is required",
  });

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;
