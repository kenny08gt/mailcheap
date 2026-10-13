import TextEmpty from "@/components/TextEmpty";
import TooltipChange from "@/components/TooltipChange";
import { LIMITS } from "@/lib/config";
import { formatChange, formatCompact, formatNumber, formatRate } from "@/lib/format";
import { rateTone } from "@/lib/health";
import { PERIOD_DAYS, compareCount, compareRate } from "@/lib/overview-series";
import { cn } from "@/lib/utils";

// The email stats of a period, each with its change from the period before. A rate changes by the
// difference between the two rates.
export default function ListStats({ current, previous }) {
	const reached = current.delivered || current.sent;
	const previousReached = previous.delivered || previous.sent;
	const rate = (key, total, previousTotal, digits) => rateStat(current, previous, key, total, previousTotal, digits);

	return (
		<GridStats
			stats={[
				countStat("Sent", current.sent, previous.sent),
				{ label: "Delivered", ...rate("delivered", current.sent, previous.sent), higherIsBetter: true },
				{ label: "Opened", ...rate("opened", reached, previousReached), higherIsBetter: true },
				{ label: "Clicked", ...rate("clicked", reached, previousReached), higherIsBetter: true },
				{
					label: "Bounced",
					...rate("bounced", current.sent, previous.sent, 2),
					tone: rateTone(current.bounced, current.sent, LIMITS.bounceRate),
				},
				{
					label: "Complaints",
					...rate("complained", current.sent, previous.sent, 3),
					tone: rateTone(current.complained, current.sent, LIMITS.complaintRate),
				},
			]}
		/>
	);
}

// The automation emails and runs of a period (lib/automation-stats.js), opens and clicks out of the
// emails sent, as the automation report counts them.
export function ListAutomationStats({ current, previous }) {
	const rate = (key, total, previousTotal) => rateStat(current, previous, key, total, previousTotal);

	return (
		<GridStats
			stats={[
				countStat("Emails sent", current.sent, previous.sent),
				{ label: "Opened", ...rate("opened", current.sent, previous.sent), higherIsBetter: true },
				{ label: "Clicked", ...rate("clicked", current.sent, previous.sent), higherIsBetter: true },
				countStat("Runs started", current.started, previous.started),
				countStat("Runs ended", current.ended, previous.ended),
				{
					label: "Goal reached",
					...rate("goalReached", current.goalEnded, previous.goalEnded),
					higherIsBetter: true,
				},
			]}
		/>
	);
}

function countStat(label, current, previous) {
	return {
		label,
		value: formatCompact(current),
		title: formatNumber(current),
		previousValue: formatNumber(previous),
		change: compareCount(current, previous),
		digits: 0,
		isCount: true,
	};
}

function rateStat(current, previous, key, total, previousTotal, digits = 1) {
	return {
		value: formatRate(current[key], total, digits),
		previousValue: formatRate(previous[key], previousTotal, digits),
		change: compareRate(current[key], total, previous[key], previousTotal),
		digits,
	};
}

function GridStats({ stats }) {
	return (
		<dl className="grid grid-cols-3 gap-px bg-border/60 lg:grid-cols-6">
			{stats.map(({ label, value, title, previousValue, change, digits, isCount, higherIsBetter, tone = "default" }) => {
				const text = formatChange(change, { digits });
				const previousLabel = `${previousValue} in the previous ${PERIOD_DAYS} days`;
				return (
					<div key={label} className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3.5 sm:px-5">
						<dt className="text-xs text-muted-foreground">{label}</dt>
						<dd
							title={title}
							className={cn("text-lg font-semibold tracking-tight tabular-nums", VALUE_TONES[tone])}
						>
							{value ?? <TextEmpty />}
						</dd>
						<dd className={cn("text-xs tabular-nums", CHANGE_TONES[changeTone(change, digits, isCount, higherIsBetter)])}>
							{text ? (
								<TooltipChange label={previousLabel}>
									{text}
									<span className="sr-only"> ({previousLabel})</span>
								</TooltipChange>
							) : (
								<TextEmpty label="No earlier data" />
							)}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

// Sent volume is neither good nor bad; rates are, in their own direction.
function changeTone(change, digits, isCount, higherIsBetter) {
	const rounded = Number((change ?? 0).toFixed(digits));
	if (isCount || rounded === 0) return "neutral";
	return rounded > 0 === Boolean(higherIsBetter) ? "good" : "bad";
}

const VALUE_TONES = {
	default: "",
	warn: "text-amber-600 dark:text-amber-400",
	bad: "text-red-600 dark:text-red-400",
};

const CHANGE_TONES = {
	neutral: "text-muted-foreground",
	good: "text-emerald-600 dark:text-emerald-400",
	bad: "text-red-600 dark:text-red-400",
};
