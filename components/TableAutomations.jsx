import Link from "next/link";
import BadgeStatus from "@/components/BadgeStatus";
import TextEmpty from "@/components/TextEmpty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatRate } from "@/lib/format";

// One newsletter's automations with their last 30 days (rows from summarizeAutomations).
export default function TableAutomations({ rows }) {
	return (
		<div className="overflow-hidden rounded-xl shadow-border">
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="pl-4">Name</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="hidden text-right sm:table-cell">In progress</TableHead>
						<TableHead className="hidden text-right md:table-cell">Started</TableHead>
						<TableHead className="hidden text-right md:table-cell">Sent</TableHead>
						<TableHead className="hidden text-right md:table-cell">Opens</TableHead>
						<TableHead className="hidden text-right md:table-cell">Clicks</TableHead>
						<TableHead className="hidden pr-4 text-right md:table-cell">Goal reached</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<TableRow key={row.id} className="relative">
							<TableCell className="w-full max-w-0 py-3 pl-4 sm:w-1/3">
								<Link href={`/automations/${row.id}`} className="block truncate font-medium after:absolute after:inset-0">
									{row.name || "Untitled automation"}
								</Link>
							</TableCell>
							<TableCell>
								<BadgeStatus status={row.status} />
							</TableCell>
							<TableCell className="hidden text-right tabular-nums sm:table-cell">
								{formatNumber(row.inProgress)}
							</TableCell>
							<TableCell className="hidden text-right tabular-nums md:table-cell">
								{formatNumber(row.started)}
							</TableCell>
							<TableCell className="hidden text-right tabular-nums md:table-cell">{formatNumber(row.sent)}</TableCell>
							<TableCell className="hidden text-right tabular-nums md:table-cell">
								{formatRate(row.opened, row.sent) ?? <TextEmpty />}
							</TableCell>
							<TableCell className="hidden text-right tabular-nums md:table-cell">
								{formatRate(row.clicked, row.sent) ?? <TextEmpty />}
							</TableCell>
							<TableCell className="hidden pr-4 text-right tabular-nums md:table-cell">
								{formatRate(row.goalReached, row.goalEnded) ?? <TextEmpty />}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
