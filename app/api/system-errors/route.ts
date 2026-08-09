import { NextResponse } from "next/server";
import { logSystemError, type ClientErrorPayload } from "@/src/shared/backend/errors/system-error";

export async function POST(req: Request) {
    try {
        const body = await req.json() as Partial<ClientErrorPayload>;
        if (!body.code || !/^KNT-[0-9]{8}-[A-Z0-9]{8}$/.test(body.code) || !body.message) {
            return NextResponse.json({ error: "Invalid error payload" }, { status: 400 });
        }
        const source = ["api", "client", "database", "auth", "network", "unknown"].includes(body.source ?? "")
            ? body.source
            : "client";
        const code = await logSystemError(
            new Error(body.technicalMessage ?? body.message),
            {
                source,
                route: body.route,
                method: body.method,
                statusCode: body.statusCode,
                tenantId: body.tenantId,
                userId: body.userId,
                requestId: body.requestId,
                metadata: body.metadata,
            },
            body.code,
        );
        return NextResponse.json({ data: { code } });
    } catch {
        return NextResponse.json({ error: "Unable to record error" }, { status: 500 });
    }
}
