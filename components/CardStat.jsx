import Link from "next/link";
import TextEmpty from "@/components/TextEmpty";
import { cn } from "@/lib/utils";

export default function CardStat({ label, value, detail, tone = "default", href }) {
	const Root = href ? Link : "div";
	return (
		<Root
			href={href}
			className={cn(
				"flex flex-col gap-1.5 rounded-xl bg-card p-4 shadow-border",
				href && "transition-colors duration-150 hover:bg-muted/40"
			)}
		>
			<span className="text-[13px] text-muted-foreground">{label}</span>
			<span className={cn("text-2xl font-semibold tracking-tight tabular-nums", VALUE_TONES[tone])}>
				{value ?? <TextEmpty />}
			</span>
			{detail && <span className="text-xs text-muted-foreground tabular-nums">{detail}</span>}
		</Root>
	);
}

const VALUE_TONES = {
	default: "",
	good: "text-emerald-600 dark:text-emerald-400",
	warn: "text-amber-600 dark:text-amber-400",
	bad: "text-red-600 dark:text-red-400",
};
