import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BadgeStatus from "@/components/BadgeStatus";
import TextEmpty from "@/components/TextEmpty";
import TimeLocal from "@/components/TimeLocal";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { RECIPIENT_FILTERS, getRecipientStatus } from "@/lib/campaign-recipients";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stripUtm } from "@/lib/utm";

const TIME_OPTIONS = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };

export function recipientsHref(campaignId, { filter, page } = {}) {
	const params = new URLSearchParams(Object.entries({ recipients: filter, page: page > 1 ? page : null }).filter(([, value]) => value));
	return `/campaigns/${campaignId}${params.size ? `?${params}` : ""}#recipients`;
}

export default function TableRecipients({ campaignId, filter, page, pageSize, counts, rows }) {
	const total = counts[filter] ?? counts.all;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const href = (changes) => recipientsHref(campaignId, { filter, page, ...changes });

	return (
		<section id="recipients" className="flex scroll-mt-6 flex-col gap-3">
			<nav aria-label="Recipients" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
				{[["all", "All"], ...Object.entries(RECIPIENT_FILTERS).map(([key, { label }]) => [key, label])].map(
					([key, label]) => {
						const isActive = key === filter;
						if (!isActive && key !== "all" && !counts[key]) return null;
						return (
							<Link
								key={key}
								href={href({ filter: key === "all" ? null : key, page: null })}
								scroll={false}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[color,background-color,box-shadow] duration-150",
									isActive
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
								)}
							>
								{label}
								<span className={cn("text-xs tabular-nums", isActive ? "opacity-70" : "opacity-60")}>
									{formatNumber(counts[key])}
								</span>
							</Link>
						);
					}
				)}
			</nav>

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

			{pageCount > 1 && (
				<div className="flex items-center justify-between gap-3 text-sm text-muted-foreground tabular-nums">
					<span>
						{formatNumber((page - 1) * pageSize + 1)}–{formatNumber(Math.min(page * pageSize, total))} of{" "}
						{formatNumber(total)}
					</span>
					<div className="flex gap-1">
						<PageLink href={href({ page: page - 1 })} isDisabled={page <= 1} label="Previous">
							<ChevronLeft />
						</PageLink>
						<PageLink href={href({ page: page + 1 })} isDisabled={page >= pageCount} label="Next">
							<ChevronRight />
						</PageLink>
					</div>
				</div>
			)}
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

function PageLink({ href, isDisabled, label, children }) {
	if (isDisabled) {
		return (
			<Button variant="outline" size="icon" disabled aria-label={label}>
				{children}
			</Button>
		);
	}
	return (
		<Button asChild variant="outline" size="icon">
			<Link href={href} scroll={false} aria-label={label}>
				{children}
			</Link>
		</Button>
	);
}
