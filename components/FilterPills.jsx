import Link from "next/link";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

// items: { key, label, count, href, isActive, isAll }. Empty filters hide unless selected or "All".
export default function FilterPills({ label, items, className }) {
	return (
		<nav aria-label={label} className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]", className)}>
			{items.map(({ key, label, count, href, isActive, isAll }) => {
				if (!isActive && !isAll && !count) return null;
				return (
					<Link
						key={key}
						href={href}
						scroll={false}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[color,background-color,box-shadow] duration-150",
							isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
						)}
					>
						{label}
						<span className={cn("text-xs tabular-nums", isActive ? "opacity-70" : "opacity-60")}>
							{formatNumber(count || 0)}
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
