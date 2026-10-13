import { stripUtm } from "./utm.js";

function countIf(field) {
	return { $sum: { $cond: [{ $gt: [`$${field}`, null] }, 1, 0] } };
}

export const MESSAGE_STATS_GROUP = {
	sent: countIf("sentAt"),
	delivered: countIf("deliveredAt"),
	opened: countIf("openedAt"),
	clicked: countIf("clickedAt"),
	bounced: countIf("bouncedAt"),
	complained: countIf("complainedAt"),
};

// Each message is one contact, so counting each link once per message gives unique clickers. Links are
// grouped without their UTM tags, which every reader got the same.
export function countLinkClicks(messages, limit = 20) {
	const clickers = new Map();
	for (const { clickedUrls = [] } of messages) {
		for (const url of new Set(clickedUrls.map(stripUtm))) clickers.set(url, (clickers.get(url) ?? 0) + 1);
	}
	return [...clickers]
		.map(([url, count]) => ({ url, clickers: count }))
		.sort((a, b) => b.clickers - a.clickers || a.url.localeCompare(b.url))
		.slice(0, limit);
}
