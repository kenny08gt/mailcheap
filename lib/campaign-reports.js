import "server-only";
import { generateJson } from "@/lib/ai";
import {
	ANALYSIS_SCHEMA,
	DEFAULT_ANALYSIS_LIMIT,
	buildAnalysisPrompt,
	buildSystemPrompt,
	normalizeAnalysis,
	summarizeCampaigns,
} from "@/lib/ai-assistant";
import { sendAdminEmail } from "@/lib/alerts";
import { getLinkClicks, getProviderBreakdowns } from "@/lib/campaign-engagement";
import { formatCampaignReport, getReportDelayHours, getReportWindow } from "@/lib/campaign-report";
import { getAppUrl, isAiEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import Campaign from "@/models/Campaign";
import Newsletter from "@/models/Newsletter";

async function analyze({ newsletter, summaries }) {
	if (!isAiEnabled()) return null;
	try {
		const { data } = await generateJson({
			kind: "analysis",
			system: buildSystemPrompt({
				newsletterName: newsletter.name,
				fromName: newsletter.fromName,
				websiteUrl: newsletter.websiteUrl,
				links: newsletter.links,
			}),
			prompt: buildAnalysisPrompt({ newsletterName: newsletter.name, campaigns: summaries }),
			schema: ANALYSIS_SCHEMA,
		});
		return normalizeAnalysis(data);
	} catch (error) {
		console.error("[reports] AI analysis failed, sending the numbers alone:", error?.message);
		return null;
	}
}

// One report per tick: the AI call can take a minute, and the tick has 290 seconds.
export async function sendDueCampaignReport({ now = new Date() } = {}) {
	if (!process.env.ALERT_FROM || !process.env.ADMIN_EMAIL) {
		console.warn("[reports] Set ALERT_FROM and ADMIN_EMAIL to get campaign results by email");
		return null;
	}
	await connectDb();
	const { sentBefore, sentAfter } = getReportWindow({ now });
	// Claimed before the work, so two ticks never send the same report. If the work fails, that
	// campaign's report is lost and logged, instead of retrying the AI call every five minutes.
	const campaign = await Campaign.findOneAndUpdate(
		{ status: "sent", sentAt: { $gt: sentAfter, $lte: sentBefore }, reportSentAt: null },
		{ $set: { reportSentAt: now } },
		{ sort: { sentAt: 1 }, returnDocument: "after", projection: { newsletterId: 1, sentAt: 1, stats: 1 } }
	).lean();
	if (!campaign) return null;

	const newsletter = await Newsletter.findById(campaign.newsletterId).select("name fromName websiteUrl links").lean();
	// This campaign and the ones before it, newest first, so it leads the list the comparison reads.
	const campaigns = await Campaign.find({ newsletterId: campaign.newsletterId, status: "sent", sentAt: { $lte: campaign.sentAt } })
		.sort({ sentAt: -1 })
		.limit(DEFAULT_ANALYSIS_LIMIT)
		.select("subject previewText format html markdown stats sentAt")
		.lean();
	const ids = campaigns.map(({ _id }) => _id);
	const [providers, links] = await Promise.all([getProviderBreakdowns(ids), getLinkClicks(ids)]);
	const summaries = summarizeCampaigns(campaigns, { providers, links });
	const analysis = await analyze({ newsletter, summaries });

	const { subject, text } = formatCampaignReport({
		newsletterName: newsletter?.name ?? "",
		stats: campaign.stats,
		summaries,
		analysis,
		url: `${getAppUrl()}/campaigns/${campaign._id}`,
		delayHours: getReportDelayHours(),
	});
	await sendAdminEmail({ title: subject, text });
	return { campaignId: String(campaign._id), analyzed: Boolean(analysis) };
}
