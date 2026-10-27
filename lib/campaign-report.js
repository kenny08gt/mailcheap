const HOUR = 3_600_000;
export const DEFAULT_REPORT_DELAY_HOURS = 72;
// Without a floor, the first deploy would email a report for every campaign ever sent.
const REPORT_WINDOW_DAYS = 14;

// Where the SES account starts getting reviewed, and where a small list starts telling you to stop.
const LIMITS = [
	["bounceRate", "bounces", 5],
	["complaintRate", "complaints", 0.1],
	["unsubscribeRate", "unsubscribes", 2],
];

export function getReportDelayHours(env = process.env) {
	const hours = Number(env.CAMPAIGN_REPORT_DELAY_HOURS);
	return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_REPORT_DELAY_HOURS;
}

// Campaigns sent inside this window are due a report.
export function getReportWindow({ now = new Date(), env = process.env } = {}) {
	const sentBefore = new Date(now.getTime() - getReportDelayHours(env) * HOUR);
	return { sentBefore, sentAfter: new Date(sentBefore.getTime() - REPORT_WINDOW_DAYS * 24 * HOUR) };
}

function rate(value) {
	return `${value ?? 0}%`;
}

function average(summaries, key) {
	const values = summaries.map((summary) => summary[key]).filter((value) => typeof value === "number");
	return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function list(items) {
	return items.map((item) => `- ${item}`);
}

// summaries come from summarizeCampaigns, newest first: the first one is the campaign being reported.
export function formatCampaignReport({ newsletterName, stats = {}, summaries, analysis, url, delayHours }) {
	const [current, ...previous] = summaries;
	const lines = [
		`"${current.subject}" (${newsletterName}), sent ${current.sentOn}`,
		"",
		`Numbers ${delayHours} hours after sending`,
		`Sent ${stats.sent ?? 0} · delivered ${stats.delivered ?? 0} · opened ${stats.opened ?? 0} (${rate(current.openRate)}) · clicked ${stats.clicked ?? 0} (${rate(current.clickRate)})`,
		`Unsubscribed ${stats.unsubscribed ?? 0} (${rate(current.unsubscribeRate)}) · bounced ${stats.bounced ?? 0} (${rate(current.bounceRate)}) · complaints ${stats.complained ?? 0} (${rate(current.complaintRate)})`,
	];

	for (const [key, label, limit] of LIMITS) {
		if ((current[key] ?? 0) > limit) lines.push(`Warning: ${label} at ${current[key]}%, above ${limit}%.`);
	}

	lines.push("");
	if (previous.length === 0) {
		lines.push("This is the first send of this newsletter, so there is nothing to compare it with yet.");
	} else {
		lines.push(
			`Against the average of the previous ${previous.length} sends`,
			`Opens ${rate(current.openRate)} vs ${rate(average(previous, "openRate"))} · clicks ${rate(current.clickRate)} vs ${rate(average(previous, "clickRate"))} · unsubscribes ${rate(current.unsubscribeRate)} vs ${rate(average(previous, "unsubscribeRate"))}`
		);
	}

	if (current.topLinks?.length) {
		lines.push("", "Links clicked (unique people)", ...list(current.topLinks.map(({ url: link, clickers }) => `${link}: ${clickers}`)));
	}

	lines.push("");
	if (analysis) {
		lines.push("What the numbers suggest", ...list(analysis.insights), "", "Ideas for the next one", ...list(analysis.suggestions));
	} else {
		lines.push("AI reading unavailable for this report (not configured, or the request failed). The numbers above are complete.");
	}

	lines.push(
		"",
		"Replies are not counted here: they arrive in your inbox, and on a small list they say more than any rate.",
		"Opens are approximate: image blocking hides some, and privacy proxies open others automatically.",
		"",
		url
	);
	return { subject: `Results: ${current.subject}`, text: lines.join("\n") };
}
