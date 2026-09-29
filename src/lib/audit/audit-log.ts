import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function logAuditEvent(params: {
  userId?: string | null;
  comparisonId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.auditEvent.create({
    data: {
      userId: params.userId ?? null,
      comparisonId: params.comparisonId ?? null,
      eventType: params.eventType,
      payload: (params.payload ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
