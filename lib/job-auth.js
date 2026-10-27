import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// The systemd timers' calls to /api/jobs/* carry "Authorization: Bearer <CRON_SECRET>". A response that refuses the
// call, or null when it may go on.
export function refuseUnauthorizedJob(request) {
	if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
	const given = Buffer.from(request.headers.get("authorization") ?? "");
	const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET}`);
	const isAuthorized = given.length === expected.length && timingSafeEqual(given, expected);
	return isAuthorized ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
