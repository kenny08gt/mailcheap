import { Suspense } from "react";
import Link from "next/link";
import { Types, isValidObjectId } from "mongoose";
import { Send } from "lucide-react";
import ButtonNewCampaign from "@/components/ButtonNewCampaign";
import FilterNewsletter from "@/components/FilterNewsletter";
import HeaderPage from "@/components/HeaderPage";
import StateEmpty from "@/components/StateEmpty";
import TableCampaigns from "@/components/TableCampaigns";
import { getIssuePageUrl } from "@/lib/archive-data";
import { recentCampaignsPipeline } from "@/lib/campaign-queries";
import { connectDb } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { NEWSLETTER_SUMMARY_FIELDS, toNewsletterMap, toNewsletterOptions } from "@/lib/newsletters";
import { cn } from "@/lib/utils";
import Campaign from "@/models/Campaign";
import Newsletter from "@/models/Newsletter";

export const metadata = { title: "Campaigns" };

// Discarded campaigns are canceled and stay off the list.
const STATUSES = ["draft", "scheduled", "sending", "paused", "sent"];

export default async function CampaignsPage({ searchParams }) {
	const params = await searchParams;
	const newsletterId = isValidObjectId(params.newsletter) ? new Types.ObjectId(params.newsletter) : null;
	const status = STATUSES.includes(params.status) ? params.status : null;

	await connectDb();
	const [campaigns, statusCounts, newsletters] = await Promise.all([
		Campaign.aggregate(recentCampaignsPipeline(200, newsletterId, status)),
		Campaign.aggregate([
			{ $match: { status: { $in: STATUSES }, ...(newsletterId && { newsletterId }) } },
			{ $group: { _id: "$status", count: { $sum: 1 } } },
		]),
		Newsletter.find()
			.sort({ createdAt: 1 })
			.select(`${NEWSLETTER_SUMMARY_FIELDS} archiveEnabled`)
			.lean(),
	]);
	const newslettersById = new Map(newsletters.map((newsletter) => [newsletter._id.toString(), newsletter]));
	const pageUrls = Object.fromEntries(
		campaigns
			.map((campaign) => [
				campaign._id.toString(),
				getIssuePageUrl({ campaign, newsletter: newslettersById.get(campaign.newsletterId.toString()) }),
			])
			.filter(([, url]) => url)
	);
	const counts = Object.fromEntries(statusCounts.map(({ _id, count }) => [_id, count]));
	const totalAll = statusCounts.reduce((sum, { count }) => sum + count, 0);

	function href(key) {
		const next = new URLSearchParams(
			Object.entries({ newsletter: newsletterId?.toString(), status: key }).filter(([, value]) => value)
		);
		return `/campaigns${next.size ? `?${next}` : ""}`;
	}

	return (
		<>
			<HeaderPage title="Campaigns">
				<ButtonNewCampaign newsletters={toNewsletterOptions(newsletters)} />
			</HeaderPage>

			<div className="flex flex-col gap-4">
				<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
					<nav
						aria-label="Status"
						className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 animate-enter [scrollbar-width:none]"
					>
						{[null, ...STATUSES].map((key) => {
							const isActive = key === status;
							if (key && !isActive && !counts[key]) return null;
							return (
								<Link
									key={key ?? "all"}
									href={href(key)}
									scroll={false}
									aria-current={isActive ? "page" : undefined}
									className={cn(
										"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[color,background-color,box-shadow] duration-150",
										isActive
											? "bg-foreground text-background"
											: "text-muted-foreground hover:bg-muted hover:text-foreground"
									)}
								>
									{key ? key.charAt(0).toUpperCase() + key.slice(1) : "All"}
									<span className={cn("text-xs tabular-nums", isActive ? "opacity-70" : "opacity-60")}>
										{formatNumber(key ? counts[key] || 0 : totalAll)}
									</span>
								</Link>
							);
						})}
					</nav>
					{newsletters.length > 1 && (
						<Suspense>
							<FilterNewsletter newsletters={toNewsletterOptions(newsletters)} />
						</Suspense>
					)}
				</div>

				{campaigns.length === 0 ? (
					<StateEmpty icon={Send} title={totalAll ? "No campaigns match" : "No campaigns yet"} />
				) : (
					<div className="animate-enter">
						<TableCampaigns
							campaigns={campaigns}
							newsletters={toNewsletterMap(newsletters)}
							hasActions
							pageUrls={pageUrls}
						/>
					</div>
				)}
			</div>
		</>
	);
}
