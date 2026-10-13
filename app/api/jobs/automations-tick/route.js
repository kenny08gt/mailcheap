import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAutomationTick } from "@/lib/automations";
import { isSendingEnabled } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request) {
	const given = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

// Called every 5 minutes by the server's systemd timer (deploy/systemd). Each result is logged: it's
// the trace of what the automations did and when.
export async function POST(request) {
	if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
	if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	if (!isSendingEnabled()) return NextResponse.json({ error: "Sending is off" }, { status: 409 });

	const result = await runAutomationTick();
	console.info(`[automations] ${JSON.stringify(result)}`);
	return NextResponse.json(result);
}
