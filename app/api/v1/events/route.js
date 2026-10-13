import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/api-keys";
import { readEventName, readProperties } from "@/lib/automation-rules";
import { exitRuns, startRuns } from "@/lib/automations";
import { connectDb } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import { isPlainObject, normalizeEmail } from "@/lib/validation";
import Contact from "@/models/Contact";
import Newsletter from "@/models/Newsletter";

// Events can start runs that send email, so a leaked key can't be used to flood a list.
const PER_KEY = { name: "api-events-key", limit: 3000, window: "1 h" };

function fail(status, error) {
	return NextResponse.json({ error }, { status });
}

function readInput(body) {
	if (!isPlainObject(body)) return { error: "Send a JSON object" };
	if (typeof body.newsletter !== "string" || !body.newsletter.trim()) return { error: "newsletter is required" };
	const email = normalizeEmail(body.email);
	if (!email) return { error: "email is invalid" };
	const event = readEventName(body.event);
	if (!event) return { error: "event must be lowercase letters, digits and _ (up to 50), and not contact_active" };
	const { properties, error } = readProperties(body.properties);
	if (error) return { error };
	return { slug: body.newsletter.trim().toLowerCase(), email, event, properties };
}

// Events act on contacts already in the newsletter: they end the runs that exit on them, then start
// the automations they trigger. They never add anyone to the list.
export async function POST(request) {
	const apiKey = await authenticateRequest(request);
	if (!apiKey) return fail(401, "Invalid API key");
	const input = readInput(await request.json().catch(() => null));
	if (input.error) return fail(400, input.error);
	if (await isRateLimited({ ...PER_KEY, key: String(apiKey._id) })) return fail(429, "Too many events, try again later");

	await connectDb();
	const newsletter = await Newsletter.findOne({ slug: input.slug }).lean();
	if (!newsletter) return fail(404, "Newsletter not found");
	const contact = await Contact.findOne({ newsletterId: newsletter._id, email: input.email }).lean();
	if (!contact) return NextResponse.json({ matched: false });

	const exited = await exitRuns({ contactId: contact._id, event: input.event });
	const started = await startRuns({ newsletter, contact, event: input.event, properties: input.properties });
	return NextResponse.json({ matched: true, started, exited });
}
