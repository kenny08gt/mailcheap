import { Mail } from "lucide-react";
import FilterPills from "@/components/FilterPills";
import HeaderPage from "@/components/HeaderPage";
import Pagination from "@/components/Pagination";
import StateEmpty from "@/components/StateEmpty";
import TableEmails from "@/components/TableEmails";
import TimeLocal from "@/components/TimeLocal";
import { AUTOMATIONS_TICK_ID, isTickStale } from "@/lib/automation-tick";
import { connectDb } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import {
	EMAIL_KINDS,
	EMAIL_STATUSES,
	EMAILS_PAGE_SIZE,
	countEmails,
	describeSource,
	emailsHref,
	lastDay,
	parseEmailFilters,
} from "@/lib/sent-emails";
import { cn } from "@/lib/utils";
import Automation from "@/models/Automation";
import Campaign from "@/models/Campaign";
import JobRun from "@/models/JobRun";
import Message from "@/models/Message";

export const metadata = { title: "Emails" };

const TICK_FORMAT = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
const ROW_FIELDS = "kind status email error campaignId automationId stepId sentAt openedAt clickedAt createdAt";

export default async function EmailsPage({ searchParams }) {
	const { kind, status, page } = parseEmailFilters(await searchParams);
	const match = { ...(kind && { kind }), ...(status && { status }) };

	await connectDb();
	const [rows, groups, sentToday, tick] = await Promise.all([
		Message.find(match)
			.sort({ _id: -1 })
			.skip((page - 1) * EMAILS_PAGE_SIZE)
			.limit(EMAILS_PAGE_SIZE)
			.select(ROW_FIELDS)
			.lean(),
		Message.aggregate([{ $group: { _id: { kind: "$kind", status: "$status" }, count: { $sum: 1 } } }]),
		Message.countDocuments({ sentAt: { $gte: lastDay() } }),
		JobRun.findById(AUTOMATIONS_TICK_ID).lean(),
	]);
	const [campaigns, automations] = await Promise.all([
		Campaign.find({ _id: { $in: rows.map(({ campaignId }) => campaignId).filter(Boolean) } })
			.select("subject")
			.lean(),
		Automation.find({ _id: { $in: rows.map(({ automationId }) => automationId).filter(Boolean) } })
			.select("name steps")
			.lean(),
	]);
	const lookups = {
		campaigns: new Map(campaigns.map((campaign) => [String(campaign._id), campaign])),
		automations: new Map(automations.map((automation) => [String(automation._id), automation])),
	};
	const counts = countEmails(groups, { kind, status });
	const href = (changes) => emailsHref({ kind, status, page, ...changes });

	return (
		<>
			<HeaderPage title="Emails">
				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
					<span>{formatNumber(sentToday)} sent in the last 24h</span>
					<span className="inline-flex items-center gap-1.5">
						<span
							className={cn("size-1.5 rounded-full", isTickStale(tick?.ranAt) ? "bg-amber-500" : "bg-emerald-500")}
						/>
						Automations timer{" "}
						{tick?.ranAt ? (
							<>
								ran <TimeLocal value={tick.ranAt} options={TICK_FORMAT} />
							</>
						) : (
							"never ran"
						)}
					</span>
				</div>
			</HeaderPage>

			<div className="flex flex-col gap-3">
				<FilterPills
					label="Kind"
					className="animate-enter"
					items={[null, ...Object.keys(EMAIL_KINDS)].map((key) => ({
						key: key ?? "all",
						label: key ? EMAIL_KINDS[key] : "All",
						count: counts.kinds[key ?? "all"],
						href: href({ kind: key, page: null }),
						isActive: key === kind,
						isAll: !key,
					}))}
				/>
				<FilterPills
					label="Status"
					className="animate-enter"
					items={[null, ...EMAIL_STATUSES].map((key) => ({
						key: key ?? "all",
						label: key ? key.charAt(0).toUpperCase() + key.slice(1) : "Any status",
						count: counts.statuses[key ?? "all"],
						href: href({ status: key, page: null }),
						isActive: key === status,
						isAll: !key,
					}))}
				/>

				{rows.length === 0 ? (
					<StateEmpty icon={Mail} title={counts.kinds.all ? "No emails match" : "No emails yet"} />
				) : (
					<div className="flex flex-col gap-3 animate-enter">
						<TableEmails
							rows={rows.map((message) => ({
								...message,
								_id: String(message._id),
								source: describeSource(message, lookups),
							}))}
						/>
						<Pagination
							page={page}
							pageSize={EMAILS_PAGE_SIZE}
							total={kind ? counts.kinds[kind] ?? 0 : counts.kinds.all}
							href={(next) => href({ page: next })}
						/>
					</div>
				)}
			</div>
		</>
	);
}
