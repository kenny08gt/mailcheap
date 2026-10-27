import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

export default function Pagination({ page, pageSize, total, href }) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	if (pageCount <= 1) return null;
	return (
		<div className="flex items-center justify-between gap-3 text-sm text-muted-foreground tabular-nums">
			<span>
				{formatNumber((page - 1) * pageSize + 1)}–{formatNumber(Math.min(page * pageSize, total))} of {formatNumber(total)}
			</span>
			<div className="flex gap-1">
				<PageLink href={href(page - 1)} isDisabled={page <= 1} label="Previous">
					<ChevronLeft />
				</PageLink>
				<PageLink href={href(page + 1)} isDisabled={page >= pageCount} label="Next">
					<ChevronRight />
				</PageLink>
			</div>
		</div>
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
