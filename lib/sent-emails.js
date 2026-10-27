// The Emails page: every Message, newest first, filtered by kind and status.
export const EMAIL_KINDS = {
	campaign: "Campaign",
	"last-chance": "Last chance",
	automation: "Automation",
	welcome: "Welcome",
	confirmation: "Confirmation",
	test: "Test",
};

export const EMAIL_STATUSES = ["queued", "sent", "delivered", "bounced", "complained", "failed", "suppressed"];

export const EMAILS_PAGE_SIZE = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export function lastDay(now = new Date()) {
	return new Date(now.getTime() - DAY_MS);
}

export function parseEmailFilters(params) {
	const page = Number.parseInt(params.page, 10);
	return {
		kind: Object.hasOwn(EMAIL_KINDS, params.kind) ? params.kind : null,
		status: EMAIL_STATUSES.includes(params.status) ? params.status : null,
		page: page > 1 ? page : 1,
	};
}

// rows: { _id: { kind, status }, count }. Each pill row counts within the other filter, so the kind
// pills say how many failed emails each kind has while the Failed filter is on.
export function countEmails(rows, { kind, status }) {
	const kinds = { all: 0 };
	const statuses = { all: 0 };
	for (const { _id, count } of rows) {
		if (!status || _id.status === status) {
			kinds.all += count;
			kinds[_id.kind] = (kinds[_id.kind] ?? 0) + count;
		}
		if (!kind || _id.kind === kind) {
			statuses.all += count;
			statuses[_id.status] = (statuses[_id.status] ?? 0) + count;
		}
	}
	return { kinds, statuses };
}

export function emailsHref({ kind, status, page }) {
	const params = new URLSearchParams(
		Object.entries({ kind, status, page: page > 1 ? page : null }).filter(([, value]) => value)
	);
	return `/emails${params.size ? `?${params}` : ""}`;
}

// What sent the email: its campaign or automation step, linked when it still exists.
export function describeSource(message, { campaigns, automations }) {
	if (message.campaignId) {
		const campaign = campaigns.get(String(message.campaignId));
		return {
			label: campaign ? campaign.subject || "Untitled campaign" : "Deleted campaign",
			href: campaign ? `/campaigns/${message.campaignId}` : null,
		};
	}
	if (message.automationId) {
		const automation = automations.get(String(message.automationId));
		if (!automation) return { label: "Deleted automation", href: null };
		const emailSteps = automation.steps.filter(({ type }) => type === "email");
		const position = emailSteps.findIndex(({ id }) => id === message.stepId);
		const step = position === -1 ? "removed email" : `email ${position + 1}`;
		return { label: `${automation.name || "Untitled automation"} · ${step}`, href: `/automations/${message.automationId}` };
	}
	return { label: EMAIL_KINDS[message.kind] ?? message.kind, href: null };
}
