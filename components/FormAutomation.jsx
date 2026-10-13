"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, Clock, Loader2, Mail, MoreHorizontal, Pause, Play, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
	deleteAutomation,
	saveAutomation,
	sendAutomationTest,
	setAutomationStatus,
} from "@/app/(app)/automations/actions";
import AvatarNewsletter from "@/components/AvatarNewsletter";
import BadgeStatus from "@/components/BadgeStatus";
import CardAutomationStep from "@/components/CardAutomationStep";
import HeaderPage from "@/components/HeaderPage";
import ReportAutomation from "@/components/ReportAutomation";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CONTACT_ACTIVE, readEventName } from "@/lib/automation-rules";
import { getSavedLinks } from "@/lib/brand-links";
import { useAutosave } from "@/lib/use-autosave";

const DEFAULT_COOLDOWN_DAYS = 7;
const NEW_WAIT_HOURS = 24;
const LOCKED_HINT = "Pause to add or remove steps";

// Runs in the browser, where node:crypto isn't available (lib/automation-steps.js newStepId is for the server).
export function newClientStepId() {
	return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function FormAutomation({ automation, newsletter, isSendingEnabled, testEmail, report }) {
	const router = useRouter();
	const [status, setStatus] = useState(automation.status);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isEventTrigger, setIsEventTrigger] = useState(automation.trigger.event !== CONTACT_ACTIVE);
	const [values, setValues] = useState({
		name: automation.name,
		trigger: automation.trigger.event,
		exitOn: automation.exitOn,
		reentry: automation.reentry.allowed
			? { allowed: true, cooldownDays: automation.reentry.cooldownDays }
			: { allowed: false },
		steps: automation.steps,
	});
	const save = useCallback((snapshot) => saveAutomation(automation._id, snapshot), [automation._id]);
	const { isDirty, isSaving, error, flush } = useAutosave(values, save);
	const [isChangingStatus, startChangingStatus] = useTransition();
	const savedLinks = useMemo(() => getSavedLinks(newsletter), [newsletter]);
	const isActive = status === "active";

	const onKeyDown = useEffectEvent((event) => {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
			event.preventDefault();
			flush();
		}
	});
	const onBeforeUnload = useEffectEvent((event) => {
		if (!isDirty && !isSaving) return;
		flush();
		event.preventDefault();
	});

	useEffect(() => {
		function handleKeyDown(event) {
			onKeyDown(event);
		}
		function handleBeforeUnload(event) {
			onBeforeUnload(event);
		}
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, []);

	function changeStatus() {
		const next = isActive ? "paused" : "active";
		startChangingStatus(async () => {
			if (!(await flush())) return void toast.error("Couldn't save the automation");
			const result = await setAutomationStatus(automation._id, next);
			if (result?.error) return void toast.error(result.error);
			setStatus(next);
			toast.success(isActive ? "Paused" : "Active");
			router.refresh();
		});
	}

	async function sendTest(stepId, properties) {
		if (!(await flush())) {
			toast.error("Couldn't save the automation");
			return false;
		}
		const result = await sendAutomationTest(automation._id, stepId, properties);
		if (result?.error) toast.error(result.error);
		else toast.success(`Test sent to ${testEmail}`);
		return !result?.error;
	}

	function changeTrigger(mode) {
		setIsEventTrigger(mode === "event");
		setValues((current) => ({ ...current, trigger: mode === "event" ? "" : CONTACT_ACTIVE }));
	}

	function changeReentry(isAllowed) {
		setValues((current) => ({
			...current,
			reentry: isAllowed ? { allowed: true, cooldownDays: DEFAULT_COOLDOWN_DAYS } : { allowed: false },
		}));
	}

	function insertStep(position, step) {
		setValues((current) => ({ ...current, steps: current.steps.toSpliced(position, 0, step) }));
	}

	function changeStep(position, step) {
		setValues((current) => ({ ...current, steps: current.steps.with(position, step) }));
	}

	function moveStep(position, direction) {
		setValues((current) => {
			const steps = current.steps.toSpliced(position, 1);
			return { ...current, steps: steps.toSpliced(position + direction, 0, current.steps[position]) };
		});
	}

	function deleteStep(position) {
		setValues((current) => ({ ...current, steps: current.steps.toSpliced(position, 1) }));
	}

	return (
		<>
			<HeaderPage
				title={values.name || "Untitled automation"}
				backHref="/automations"
				icon={<AvatarNewsletter newsletter={newsletter} size={28} />}
				meta={<BadgeStatus status={status} />}
			>
				<StatusSave isSaving={isDirty || isSaving} error={error} onRetry={flush} />
				<Button variant={isActive ? "outline" : "default"} onClick={changeStatus} disabled={isChangingStatus}>
					{isChangingStatus ? (
						<Loader2 data-icon="inline-start" className="animate-spin" />
					) : isActive ? (
						<Pause data-icon="inline-start" />
					) : (
						<Play data-icon="inline-start" />
					)}
					{isActive ? "Pause" : "Activate"}
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" aria-label="More">
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
							<Trash2 />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<DialogDeleteAutomation
					id={automation._id}
					name={values.name}
					isOpen={isDeleteOpen}
					onOpenChange={setIsDeleteOpen}
				/>
			</HeaderPage>

			<div className="flex flex-col gap-8">
				<div className="overflow-hidden rounded-xl bg-card shadow-border animate-enter">
					<Row label="Name">
						<input
							value={values.name}
							onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
							placeholder="Untitled automation"
							maxLength={120}
							aria-label="Name"
							className="h-11 w-full min-w-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
						/>
					</Row>
					<Row label="Newsletter">
						<span className="truncate text-sm">{newsletter.name}</span>
					</Row>
					<Row label="Trigger">
						<div className="flex flex-wrap items-center gap-2 py-1.5">
							<Select value={isEventTrigger ? "event" : "list"} onValueChange={changeTrigger}>
								<SelectTrigger aria-label="Trigger" className="w-64">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="list">Joins the list ({CONTACT_ACTIVE})</SelectItem>
									<SelectItem value="event">An event…</SelectItem>
								</SelectContent>
							</Select>
							{isEventTrigger && (
								<Input
									value={values.trigger}
									onChange={(event) => setValues((current) => ({ ...current, trigger: event.target.value }))}
									placeholder="plan_checkout_started"
									maxLength={50}
									aria-label="Event name"
									className="w-60 font-mono text-[13px]"
								/>
							)}
						</div>
					</Row>
					<Row label="Exit on">
						<InputEvents
							events={values.exitOn}
							onChange={(exitOn) => setValues((current) => ({ ...current, exitOn }))}
						/>
					</Row>
					<Row label="Re-entry" isLast>
						<div className="flex flex-wrap items-center gap-2.5 py-2.5 text-sm">
							<Switch
								checked={values.reentry.allowed}
								onCheckedChange={changeReentry}
								aria-label="Can start again"
							/>
							<span>Can start again</span>
							{values.reentry.allowed && (
								<>
									<span className="text-muted-foreground">after</span>
									<Input
										type="number"
										min={1}
										step={1}
										value={values.reentry.cooldownDays}
										onChange={(event) =>
											setValues((current) => ({
												...current,
												reentry: { allowed: true, cooldownDays: event.target.value === "" ? "" : Number(event.target.value) },
											}))
										}
										aria-label="Cooldown days"
										className="w-20 tabular-nums"
									/>
									<span className="text-muted-foreground">days</span>
								</>
							)}
						</div>
					</Row>
				</div>

				<section className="flex flex-col gap-3">
					<div className="flex items-baseline justify-between gap-3">
						<h2 className="text-lg font-semibold tracking-tight">Steps</h2>
						{isActive && <p className="text-xs text-muted-foreground">{LOCKED_HINT}</p>}
					</div>
					{values.steps.map((step, index) => (
						<div key={step.id} className="flex flex-col gap-3">
							<AddStep isLocked={isActive} onAdd={(added) => insertStep(index, added)} />
							<CardAutomationStep
								step={step}
								index={index}
								count={values.steps.length}
								savedLinks={savedLinks}
								isLocked={isActive}
								isSendingEnabled={isSendingEnabled}
								onChange={(changed) => changeStep(index, changed)}
								onMove={(direction) => moveStep(index, direction)}
								onDelete={() => deleteStep(index)}
								onTest={sendTest}
							/>
						</div>
					))}
					<AddStep isLocked={isActive} onAdd={(added) => insertStep(values.steps.length, added)} />
				</section>

				<ReportAutomation steps={values.steps} stepStats={report.stepStats} runs={report.runs} />
			</div>
		</>
	);
}

function AddStep({ isLocked, onAdd }) {
	return (
		<div className="flex justify-center gap-2">
			<Button
				variant="ghost"
				size="sm"
				disabled={isLocked}
				title={isLocked ? LOCKED_HINT : undefined}
				onClick={() => onAdd({ id: newClientStepId(), type: "wait", hours: NEW_WAIT_HOURS })}
			>
				<Clock data-icon="inline-start" />
				Wait
			</Button>
			<Button
				variant="ghost"
				size="sm"
				disabled={isLocked}
				title={isLocked ? LOCKED_HINT : undefined}
				onClick={() => onAdd({ id: newClientStepId(), type: "email", subject: "", previewText: "", html: "" })}
			>
				<Mail data-icon="inline-start" />
				Email
			</Button>
		</div>
	);
}

// Event names become chips on Enter or comma.
function InputEvents({ events, onChange }) {
	const [text, setText] = useState("");

	function add() {
		const name = text.trim();
		if (!name) return;
		const event = readEventName(name);
		if (!event) return void toast.error("Event names use lowercase letters, digits and _, and can't be contact_active");
		if (!events.includes(event)) onChange([...events, event]);
		setText("");
	}

	return (
		<div className="flex flex-wrap items-center gap-1.5 py-2">
			{events.map((event) => (
				<span key={event} className="flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 font-mono text-xs">
					{event}
					<button
						type="button"
						aria-label={`Remove ${event}`}
						onClick={() => onChange(events.filter((item) => item !== event))}
						className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
					>
						<X className="size-3" />
					</button>
				</span>
			))}
			<input
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key !== "Enter" && event.key !== ",") return;
					event.preventDefault();
					add();
				}}
				onBlur={add}
				placeholder={events.length === 0 ? "plan_purchased" : "Add event"}
				aria-label="Exit events"
				className="h-7 min-w-32 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:text-muted-foreground"
			/>
		</div>
	);
}

function DialogDeleteAutomation({ id, name, isOpen, onOpenChange }) {
	const [isDeleting, startDeleting] = useTransition();

	function remove() {
		startDeleting(async () => {
			const result = await deleteAutomation(id);
			if (result?.error) toast.error(result.error);
		});
	}

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Delete this automation?</DialogTitle>
					<DialogDescription>
						<span className="font-medium text-foreground">{name || "Untitled automation"}</span> and its report are
						removed. Emails already sent stay sent.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Cancel</Button>
					</DialogClose>
					<Button variant="destructive" onClick={remove} disabled={isDeleting} className="min-w-20">
						{isDeleting ? <Loader2 className="animate-spin" /> : "Delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function StatusSave({ isSaving, error, onRetry }) {
	if (error) {
		return (
			<button
				type="button"
				onClick={onRetry}
				title={error}
				className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
			>
				<CircleAlert className="size-3.5" />
				Not saved, retry
			</button>
		);
	}
	return (
		<span aria-live="polite" className="flex min-w-16 items-center justify-end gap-1.5 text-xs text-muted-foreground">
			{isSaving ? (
				"Saving…"
			) : (
				<>
					<Check className="size-3.5" />
					Saved
				</>
			)}
		</span>
	);
}

function Row({ label, isLast, children }) {
	return (
		<div
			className={`grid min-h-11 grid-cols-[6rem_minmax(0,1fr)] items-center px-4 transition-colors duration-150 focus-within:bg-muted/40 ${isLast ? "" : "border-b border-border/60"}`}
		>
			<span className="text-sm text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}
