import BadgeStatus from "@/components/BadgeStatus";
import TextEmpty from "@/components/TextEmpty";
import TimeLocal from "@/components/TimeLocal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { findPosition } from "@/lib/automation-steps";
import { formatNumber, formatRate } from "@/lib/format";

const STARTED_FORMAT = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export default function ReportAutomation({ steps, stepStats, runs }) {
	const statsById = new Map(stepStats.map((stat) => [stat._id, stat]));
	const emails = steps.flatMap((step, index) => (step.type === "email" ? [{ step, number: index + 1 }] : []));

	return (
		<section className="flex flex-col gap-4 animate-enter">
			<h2 className="text-lg font-semibold tracking-tight">Report</h2>

			{emails.length === 0 ? (
				<p className="text-sm text-muted-foreground">Add an email step to see results.</p>
			) : (
				<div className="overflow-hidden rounded-xl shadow-border">
					<Table>
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="pl-4">Email</TableHead>
								<TableHead className="text-right">Sent</TableHead>
								<TableHead className="text-right">Opened</TableHead>
								<TableHead className="text-right">Clicked</TableHead>
								<TableHead className="pr-4 text-right">Failed</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{emails.map(({ step, number }) => {
								const stat = statsById.get(step.id) ?? { sent: 0, opened: 0, clicked: 0, failed: 0 };
								return (
									<TableRow key={step.id}>
										<TableCell className="max-w-0 pl-4">
											<span className="block truncate">
												<span className="text-muted-foreground tabular-nums">{number}. </span>
												{step.subject || "No subject"}
											</span>
										</TableCell>
										<TableCell className="text-right tabular-nums">{formatNumber(stat.sent)}</TableCell>
										<TableCell className="text-right tabular-nums">
											<Count count={stat.opened} total={stat.sent} />
										</TableCell>
										<TableCell className="text-right tabular-nums">
											<Count count={stat.clicked} total={stat.sent} />
										</TableCell>
										<TableCell className="pr-4 text-right tabular-nums">{formatNumber(stat.failed)}</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<div>
				<h3 className="mb-2 text-sm font-medium text-muted-foreground">Latest runs</h3>
				{runs.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nobody has entered this automation yet.</p>
				) : (
					<div className="overflow-hidden rounded-xl shadow-border">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="pl-4">Contact</TableHead>
									<TableHead>Step</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="hidden sm:table-cell">Exit reason</TableHead>
									<TableHead className="pr-4 text-right">Started</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{runs.map((run) => (
									<TableRow key={run._id}>
										<TableCell className="max-w-0 pl-4">
											<span className="block truncate">{run.email ?? "Deleted contact"}</span>
										</TableCell>
										<TableCell className="tabular-nums">
											{run.status === "active" ? `Step ${findPosition(steps, run.stepId, run.stepIndex) + 1}` : <TextEmpty />}
										</TableCell>
										<TableCell>
											<BadgeStatus status={run.status} />
										</TableCell>
										<TableCell className="hidden sm:table-cell">{run.exitReason ?? <TextEmpty />}</TableCell>
										<TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
											<TimeLocal value={run.enrolledAt} options={STARTED_FORMAT} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</div>
		</section>
	);
}

function Count({ count, total }) {
	const rate = formatRate(count, total, 0);
	return (
		<>
			{formatNumber(count)}
			{rate && <span className="ml-1.5 text-xs text-muted-foreground">{rate}</span>}
		</>
	);
}
