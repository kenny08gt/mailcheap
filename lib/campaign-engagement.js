import "server-only";
import { RECIPIENT_FILTERS, getRecipientFilter } from "@/lib/campaign-recipients";
import { MESSAGE_STATS_GROUP, countLinkClicks } from "@/lib/message-stats";
import Message from "@/models/Message";

function byCampaign(campaignIds, rows) {
	const groups = new Map(campaignIds.map((id) => [String(id), []]));
	for (const row of rows) groups.get(String(row.campaignId))?.push(row);
	return groups;
}

export async function getProviderBreakdowns(campaignIds) {
	const rows = await Message.aggregate([
		{ $match: { campaignId: { $in: campaignIds }, kind: "campaign" } },
		{ $group: { _id: { campaignId: "$campaignId", provider: { $ifNull: ["$provider", "other"] } }, ...MESSAGE_STATS_GROUP } },
		{ $sort: { sent: -1 } },
	]);
	return byCampaign(
		campaignIds,
		rows.filter(({ sent }) => sent > 0).map(({ _id: { campaignId, provider }, ...row }) => ({ campaignId, provider, ...row }))
	);
}

export async function getLinkClicks(campaignIds, limit) {
	const messages = await Message.find({
		campaignId: { $in: campaignIds },
		kind: "campaign",
		"clickedUrls.0": { $exists: true },
	})
		.select("campaignId clickedUrls")
		.lean();
	const groups = byCampaign(campaignIds, messages);
	return new Map([...groups].map(([id, rows]) => [id, countLinkClicks(rows, limit)]));
}

const RECIPIENT_KINDS = { $in: ["campaign", "last-chance"] };
const RECIPIENT_FIELDS = "kind email status error sentAt deliveredAt openedAt clickedAt clickedUrls bouncedAt complainedAt unsubscribedAt";

// One page of who got the campaign, with a count per filter. Last-chance emails count as recipients,
// as they do in the campaign's stats.
export async function getRecipients(campaignId, { filter, page, pageSize }) {
	const base = { campaignId, kind: RECIPIENT_KINDS };
	const { match, sort } = getRecipientFilter(filter);
	const keys = Object.keys(RECIPIENT_FILTERS);
	const [total, filterCounts, rows] = await Promise.all([
		Message.countDocuments(base),
		Promise.all(keys.map((key) => Message.countDocuments({ ...base, ...RECIPIENT_FILTERS[key].match }))),
		Message.find({ ...base, ...match })
			.sort({ ...sort, _id: 1 })
			.skip((page - 1) * pageSize)
			.limit(pageSize)
			.select(RECIPIENT_FIELDS)
			.lean(),
	]);
	return { counts: { all: total, ...Object.fromEntries(keys.map((key, index) => [key, filterCounts[index]])) }, rows };
}
