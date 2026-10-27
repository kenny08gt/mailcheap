import { NextResponse } from "next/server";
import { refuseUnauthorizedJob } from "@/lib/job-auth";
import { runListHygiene } from "@/lib/list-hygiene";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Every 6 hours from the mailcheap-list-hygiene timer. ?dryRun=1 reports what a run would change and writes nothing.
export async function POST(request) {
	const refused = refuseUnauthorizedJob(request);
	if (refused) return refused;
	const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
	return NextResponse.json(await runListHygiene({ dryRun }));
}
