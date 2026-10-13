import Link from "next/link";
import { TriangleAlert, Workflow } from "lucide-react";
import AvatarNewsletter from "@/components/AvatarNewsletter";
import BadgeStatus from "@/components/BadgeStatus";
import ButtonNewAutomation from "@/components/ButtonNewAutomation";
import HeaderPage from "@/components/HeaderPage";
import StateEmpty from "@/components/StateEmpty";
import TimeLocal from "@/components/TimeLocal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONTACT_ACTIVE } from "@/lib/automation-rules";
import { isSendingEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { NEWSLETTER_SUMMARY_FIELDS, toNewsletterMap, toNewsletterOptions } from "@/lib/newsletters";
import Automation from "@/models/Automation";
import Enrollment from "@/models/Enrollment";
import JobRun from "@/models/JobRun";
import Newsletter from "@/models/Newsletter";

export const metadata = { title: "Automations" };

const STALE_TICK_MS = 30 * 60 * 1000;
const TICK_FORMAT = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export default async function AutomationsPage() {
	await connectDb();
	const [automations, newsletters, counts, tick] = await Promise.all([
		Automation.find().sort({ createdAt: -1 }).lean(),
		Newsletter.find().sort({ createdAt: 1 }).select(NEWSLETTER_SUMMARY_FIELDS).lean(),
		Enrollment.aggregate([{ $group: { _id: { a: "$automationId", s: "$status" }, n: { $sum: 1 } } }]),
		JobRun.findById("automations-tick").lean(),
	]);
	const newslettersById = toNewsletterMap(newsletters);
	const countsById = new Map();
	for (const { _id, n } of counts) {
		const key = String(_id.a);
		countsById.set(key, { ...countsById.get(key), [_id.s]: n });
	}
	const hasActive = automations.some(({ status }) => status === "active");
	const isSending = isSendingEnabled();
	const isTickStale = isStale(tick?.ranAt);

	return (
		<>
			<HeaderPage title="Automations">
				<ButtonNewAutomation newsletters={toNewsletterOptions(newsletters)} />
			</HeaderPage>

			{hasActive && !isSending && <Notice>Sending is off, so automations are waiting.</Notice>}
			{hasActive && isSending && isTickStale && (
				<Notice>
					The automations timer hasn&apos;t run since{" "}
					{tick?.ranAt ? <TimeLocal value={tick.ranAt.toISOString()} options={TICK_FORMAT} /> : "it was set up"}. Runs
					are waiting. Check{" "}
					<code className="font-mono text-[13px]">systemctl status mailcheap-automations.timer</code> on the server.
				</Notice>
			)}

			{automations.length === 0 ? (
				<StateEmpty icon={Workflow} title="No automations yet" />
			) : (
				<div className="overflow-hidden rounded-xl shadow-border animate-enter">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="pl-4">Name</TableHead>
								<TableHead className="hidden sm:table-cell">Trigger</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="hidden text-right md:table-cell">In progress</TableHead>
								<TableHead className="hidden text-right md:table-cell">Completed</TableHead>
								<TableHead className="hidden pr-4 text-right md:table-cell">Exited</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{automations.map((automation) => {
								const id = String(automation._id);
								const newsletter = newslettersById[String(automation.newsletterId)];
								const stats = countsById.get(id) ?? {};
								return (
									<TableRow key={id} className="relative">
										<TableCell className="w-full max-w-0 py-3 pl-4 sm:w-1/2">
											<Link href={`/automations/${id}`} className="block truncate font-medium after:absolute after:inset-0">
												{automation.name || "Untitled automation"}
											</Link>
											<span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
												<AvatarNewsletter newsletter={newsletter} size={14} />
												<span className="truncate">{newsletter?.name}</span>
											</span>
										</TableCell>
										<TableCell className="hidden sm:table-cell">
											{automation.trigger.event === CONTACT_ACTIVE ? (
												"Joins the list"
											) : (
												<span className="font-mono text-[13px]">{automation.trigger.event}</span>
											)}
										</TableCell>
										<TableCell>
											<BadgeStatus status={automation.status} />
										</TableCell>
										<TableCell className="hidden text-right tabular-nums md:table-cell">
											{formatNumber(stats.active ?? 0)}
										</TableCell>
										<TableCell className="hidden text-right tabular-nums md:table-cell">
											{formatNumber(stats.completed ?? 0)}
										</TableCell>
										<TableCell className="hidden pr-4 text-right tabular-nums md:table-cell">
											{formatNumber(stats.exited ?? 0)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}
		</>
	);
}

function isStale(ranAt) {
	return !ranAt || Date.now() - ranAt.getTime() > STALE_TICK_MS;
}

function Notice({ children }) {
	return (
		<div
			role="status"
			className="mb-4 flex items-start gap-2.5 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-900 shadow-border animate-enter dark:text-amber-200"
		>
			<TriangleAlert className="mt-0.5 size-4 shrink-0" />
			<p>{children}</p>
		</div>
	);
}
