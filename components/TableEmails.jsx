import Link from "next/link";
import BadgeStatus from "@/components/BadgeStatus";
import TextEmpty from "@/components/TextEmpty";
import TimeLocal from "@/components/TimeLocal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TIME_OPTIONS = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

// rows: Messages with a `source` ({ label, href }) from describeSource.
export default function TableEmails({ rows }) {
	return (
		<div className="overflow-hidden rounded-xl shadow-border">
			<Table className="table-fixed">
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						<TableHead className="w-32 pl-4">Time</TableHead>
						<TableHead>Recipient</TableHead>
						<TableHead className="hidden md:table-cell">From</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="hidden w-32 sm:table-cell">Opened</TableHead>
						<TableHead className="hidden w-32 lg:table-cell">Clicked</TableHead>
						<TableHead className="hidden pr-4 xl:table-cell">Error</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((message) => (
						<TableRow key={message._id} className="tabular-nums">
							<TableCell className="pl-4 text-muted-foreground">
								<TimeLocal value={message.sentAt ?? message.createdAt} options={TIME_OPTIONS} />
							</TableCell>
							<TableCell className="font-medium">
								<span className="block truncate" title={message.email}>
									{message.email}
								</span>
							</TableCell>
							<TableCell className="hidden md:table-cell">
								{message.source.href ? (
									<Link href={message.source.href} className="block truncate hover:underline" title={message.source.label}>
										{message.source.label}
									</Link>
								) : (
									<span className="block truncate text-muted-foreground" title={message.source.label}>
										{message.source.label}
									</span>
								)}
							</TableCell>
							<TableCell>
								<BadgeStatus status={message.status} />
							</TableCell>
							<TableCell className="hidden text-muted-foreground sm:table-cell">
								{message.openedAt ? <TimeLocal value={message.openedAt} options={TIME_OPTIONS} /> : <TextEmpty />}
							</TableCell>
							<TableCell className="hidden text-muted-foreground lg:table-cell">
								{message.clickedAt ? <TimeLocal value={message.clickedAt} options={TIME_OPTIONS} /> : <TextEmpty />}
							</TableCell>
							<TableCell className="hidden pr-4 text-muted-foreground xl:table-cell">
								{message.error ? (
									<span className="block truncate" title={message.error}>
										{message.error}
									</span>
								) : (
									<TextEmpty />
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
