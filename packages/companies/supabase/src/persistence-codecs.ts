import { z } from "zod";

export const companyRowSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().min(1),
  name: z.string().min(1),
  rif: z.string().nullable(),
});
