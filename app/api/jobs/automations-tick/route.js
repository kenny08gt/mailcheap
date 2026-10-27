import { NextResponse } from "next/server";
import { runAutomationTick } from "@/lib/automations";
import { sendDueCampaignReport } from "@/lib/campaign-reports";
import { isSendingEnabled } from "@/lib/config";
import { refuseUnauthorizedJob } from "@/lib/job-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request) {
	const refused = refuseUnauthorizedJob(request);
	if (refused) return refused;
	if (!isSendingEnabled()) return NextResponse.json({ error: "Sending is off" }, { status: 409 });

	const result = await runAutomationTick();
	console.info(`[automations] ${JSON.stringify(result)}`);

	// Rides on this timer rather than its own; a failure here never holds up the automations above.
	let report = null;
	try {
		report = await sendDueCampaignReport();
	} catch (error) {
		console.error("[reports] Could not send a campaign report:", error);
	}
	return NextResponse.json({ ...result, report });
}
