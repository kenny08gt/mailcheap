import { isValidObjectId } from "mongoose";
import { notFound } from "next/navigation";
import CampaignReport from "@/components/CampaignReport";
import FormCampaign from "@/components/FormCampaign";
import { getArchiveUrls } from "@/lib/archive-hosts";
import { getLinkClicks, getProviderBreakdowns, getRecipients } from "@/lib/campaign-engagement";
import { RECIPIENT_FILTERS } from "@/lib/campaign-recipients";
import { sendTimesPipeline } from "@/lib/campaign-queries";
import { getRecentAiSpend } from "@/lib/ai";
import { getDefaultModel, getModelOptions } from "@/lib/ai-assistant";
import { isAiEnabled, isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { listSesDomains } from "@/lib/ses";
import Campaign from "@/models/Campaign";
import Contact from "@/models/Contact";
import Newsletter from "@/models/Newsletter";

export const metadata = { title: "Campaign" };

const RECIPIENTS_PAGE_SIZE = 50;

export default async function CampaignPage({ params, searchParams }) {
	const [{ id }, query] = await Promise.all([params, searchParams]);
	if (!isValidObjectId(id)) notFound();

	await connectDb();
	const campaign = await Campaign.findById(id).lean();
	if (!campaign) notFound();
	const newsletter = await Newsletter.findById(campaign.newsletterId).lean();
	if (!newsletter) notFound();

	if (!["draft", "scheduled"].includes(campaign.status)) {
		const filter = Object.hasOwn(RECIPIENT_FILTERS, query.recipients) ? query.recipients : "all";
		const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
		const [providers, links, remainingCount, recipients] = await Promise.all([
			getProviderBreakdowns([campaign._id]),
			getLinkClicks([campaign._id]),
			countRemaining(campaign),
			getRecipients(campaign._id, { filter, page, pageSize: RECIPIENTS_PAGE_SIZE }),
		]);
		return (
			<CampaignReport
				campaign={serialize(campaign)}
				newsletter={serialize(newsletter)}
				providers={providers.get(String(campaign._id))}
				links={links.get(String(campaign._id))}
				remainingCount={remainingCount}
				recipients={{ ...serialize(recipients), filter, page, pageSize: RECIPIENTS_PAGE_SIZE }}
			/>
		);
	}

	const [audienceCount, domains, sendTimes, aiSpend] = await Promise.all([
		Contact.countDocuments({ newsletterId: newsletter._id, status: "active" }),
		listSesDomains(),
		getSendTimes(campaign),
		isAiEnabled() ? getRecentAiSpend() : null,
	]);
	const fromDomain = newsletter.fromEmail.split("@")[1];
	const isDomainVerified =
		Array.isArray(domains) && domains.some(({ domain, verified }) => domain === fromDomain && verified);

	return (
		<FormCampaign
			campaign={serialize(campaign)}
			newsletter={serialize(newsletter)}
			audienceCount={audienceCount}
			isDomainVerified={isDomainVerified}
			isSendingEnabled={isSendingEnabled()}
			testEmail={process.env.ADMIN_EMAIL}
			sendTimes={sendTimes}
			archiveUrlBase={newsletter.archiveEnabled ? getArchiveUrls(newsletter).absolutePost("") : null}
			aiSpend={aiSpend}
			aiModels={aiSpend && { options: getModelOptions(), defaultModel: getDefaultModel() }}
		/>
	);
}

// A newsletter's first issue borrows the times the other newsletters go out.
async function getSendTimes(campaign) {
	const own = await Campaign.aggregate(
		sendTimesPipeline({ newsletterId: campaign.newsletterId, excludeId: campaign._id })
	);
	const rows = own.length > 0 ? own : await Campaign.aggregate(sendTimesPipeline({ excludeId: campaign._id }));
	return {
		history: rows.map(({ at }) => at.toISOString()),
		taken: own.filter(({ status }) => status === "scheduled").map(({ at }) => at.toISOString()),
	};
}

// Only a send capped to the most engaged has a next step. Close enough for the dialog: contacts who
// left after receiving it make this a little low, and the send itself skips everyone who has it.
async function countRemaining(campaign) {
	if (campaign.status !== "sent" || !campaign.audienceLimit) return 0;
	const active = await Contact.countDocuments({ newsletterId: campaign.newsletterId, status: "active" });
	const reached = (campaign.stats?.recipients ?? 0) + (campaign.lastChance?.recipients ?? 0);
	return Math.max(0, active - reached);
}
