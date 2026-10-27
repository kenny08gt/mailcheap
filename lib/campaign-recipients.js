// The campaign report's recipient list: one filter per stat card, each a Message query.
export const RECIPIENT_FILTERS = {
	opened: { label: "Opened", match: { openedAt: { $ne: null } }, sort: { openedAt: -1 } },
	clicked: { label: "Clicked", match: { clickedAt: { $ne: null } }, sort: { clickedAt: -1 } },
	"not-opened": { label: "Not opened", match: { deliveredAt: { $ne: null }, openedAt: null }, sort: { email: 1 } },
	bounced: { label: "Bounced", match: { bouncedAt: { $ne: null } }, sort: { bouncedAt: -1 } },
	complained: { label: "Complaints", match: { complainedAt: { $ne: null } }, sort: { complainedAt: -1 } },
	unsubscribed: { label: "Unsubscribed", match: { unsubscribedAt: { $ne: null } }, sort: { unsubscribedAt: -1 } },
	failed: { label: "Failed", match: { status: "failed" }, sort: { email: 1 } },
};

export const ALL_RECIPIENTS = { label: "All", match: {}, sort: { email: 1 } };

export function getRecipientFilter(key) {
	return Object.hasOwn(RECIPIENT_FILTERS, key) ? RECIPIENT_FILTERS[key] : ALL_RECIPIENTS;
}

// What happened to one email, worst first: a complaint outranks the open that came before it.
export function getRecipientStatus(message) {
	if (message.complainedAt) return "complained";
	if (message.bouncedAt) return "bounced";
	if (message.status === "failed" || message.status === "suppressed") return message.status;
	if (message.unsubscribedAt) return "unsubscribed";
	if (message.clickedAt) return "clicked";
	if (message.openedAt) return "opened";
	return message.status;
}
