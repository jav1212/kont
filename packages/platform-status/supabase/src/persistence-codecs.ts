import { z } from "zod";
import { PortalAvailability } from "@kontave/platform-status-domain";

export const latestPortalStatusRowSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["fiscal", "laboral", "mercantil"]),
  logo_url: z.string().nullable(),
  display_order: z.number().int(),
  status: z.enum([
    PortalAvailability.Operational,
    PortalAvailability.Degraded,
    PortalAvailability.Down,
  ]).nullable(),
  response_time_ms: z.number().int().nonnegative().nullable(),
  checked_at: z.string().nullable(),
});
