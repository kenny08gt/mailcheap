import "server-only";
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
