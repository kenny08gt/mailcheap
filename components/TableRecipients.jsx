import BadgeStatus from "@/components/BadgeStatus";
import FilterPills from "@/components/FilterPills";
import Pagination from "@/components/Pagination";
import TextEmpty from "@/components/TextEmpty";
import TimeLocal from "@/components/TimeLocal";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { RECIPIENT_FILTERS, getRecipientStatus } from "@/lib/campaign-recipients";
import { stripUtm } from "@/lib/utm";

const TIME_OPTIONS = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export function recipientsHref(campaignId, { filter, page } = {}) {
	const params = new URLSearchParams(Object.entries({ recipients: filter, page: page > 1 ? page : null }).filter(([, value]) => value));
	return `/campaigns/${campaignId}${params.size ? `?${params}` : ""}#recipients`;
}

export default function TableRecipients({ campaignId, filter, page, pageSize, counts, rows }) {
	const total = counts[filter] ?? counts.all;
	const href = (changes) => recipientsHref(campaignId, { filter, page, ...changes });

	return (
		<section id="recipients" className="flex scroll-mt-6 flex-col gap-3">
			<FilterPills
				label="Recipients"
				items={[["all", "All"], ...Object.entries(RECIPIENT_FILTERS).map(([key, { label }]) => [key, label])].map(
					([key, label]) => ({
						key,
						label,
						count: counts[key],
						href: href({ filter: key === "all" ? null : key, page: null }),
						isActive: key === filter,
						isAll: key === "all",
					})
				)}
			/>

			{rows.length === 0 ? (
				<p className="rounded-xl px-4 py-8 text-center text-sm text-muted-foreground shadow-border">No recipients here</p>
			) : (
				<div className="overflow-hidden rounded-xl shadow-border">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow className="hover:bg-transparent">
								<TableHead className="pl-4">Email</TableHead>
								<TableHead className="w-32">Status</TableHead>
								<TableHead className="hidden w-36 sm:table-cell">Opened</TableHead>
								<TableHead className="hidden w-36 md:table-cell">Clicked</TableHead>
								<TableHead className="hidden pr-4 lg:table-cell">Detail</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((message) => (
								<TableRow key={message._id} className="tabular-nums">
									<TableCell className="pl-4 font-medium">
										<span className="block truncate" title={message.email}>
											{message.email}
										</span>
									</TableCell>
									<TableCell>
										<BadgeStatus status={getRecipientStatus(message)} />
									</TableCell>
									<TableCell className="hidden text-muted-foreground sm:table-cell">
										{message.openedAt ? <TimeLocal value={message.openedAt} options={TIME_OPTIONS} /> : <TextEmpty />}
									</TableCell>
									<TableCell className="hidden text-muted-foreground md:table-cell">
										{message.clickedAt ? <TimeLocal value={message.clickedAt} options={TIME_OPTIONS} /> : <TextEmpty />}
									</TableCell>
									<TableCell className="hidden pr-4 text-muted-foreground lg:table-cell">
										<RecipientDetail message={message} />
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			<Pagination page={page} pageSize={pageSize} total={total} href={(next) => href({ page: next })} />
		</section>
	);
}

// The bounce or failure reason when there is one, else the links they clicked.
function RecipientDetail({ message }) {
	const parts = [];
	if (message.kind === "last-chance") parts.push("Last chance");
	if (message.error) parts.push(message.error);
	else if (message.clickedUrls?.length) {
		parts.push([...new Set(message.clickedUrls.map(stripUtm))].map((url) => url.replace(/^https?:\/\/(www\.)?/, "")).join(", "));
	}
	if (parts.length === 0) return <TextEmpty />;
	const text = parts.join(" · ");
	return (
		<span className="block truncate" title={text}>
			{text}
		</span>
	);
}
