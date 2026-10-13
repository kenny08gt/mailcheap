"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Clock, Eye, EyeOff, FlaskConical, Loader2, Mail, Trash2 } from "lucide-react";
import EditorRich from "@/components/EditorRich";
import PreviewEmail from "@/components/PreviewEmail";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fillHtml, fillText, listVariables, sampleValue } from "@/lib/automation-variables";
import { UNSUBSCRIBE_PLACEHOLDER, renderEmail, withResponsiveImages } from "@/lib/render-email";

const HOURS_PER_DAY = 24;
const FILLED_FROM_TEST_ADDRESS = "email";

export default function CardAutomationStep({
	step,
	index,
	count,
	savedLinks,
	isLocked,
	isSendingEnabled,
	newsletter,
	testEmail,
	onChange,
	onMove,
	onDelete,
	onTest,
}) {
	const isEmail = step.type === "email";
	const Icon = isEmail ? Mail : Clock;
	const [isPreviewOpen, setIsPreviewOpen] = useState(true);
	const [edited, setEdited] = useState({});
	const keys = listVariables([step.subject, step.previewText, step.html]).filter(
		(key) => key !== FILLED_FROM_TEST_ADDRESS,
	);
	const samples = Object.fromEntries(keys.map((key) => [key, edited[key] ?? sampleValue(key, newsletter.websiteUrl)]));

	function setSample(key, value) {
		setEdited((current) => ({ ...current, [key]: value }));
	}

	return (
		<div className="overflow-hidden rounded-xl bg-card shadow-border animate-enter">
			<div className="flex items-center gap-2 border-b border-border/60 px-4 py-2">
				<Icon className="size-4 text-muted-foreground" />
				<span className="text-sm font-medium tabular-nums">
					{index + 1}. {isEmail ? "Email" : "Wait"}
				</span>
				<div className="ml-auto flex items-center gap-0.5">
					{isEmail && (
						<Button
							variant="ghost"
							size="icon"
							aria-label={isPreviewOpen ? "Hide preview" : "Show preview"}
							aria-pressed={isPreviewOpen}
							onClick={() => setIsPreviewOpen((current) => !current)}
						>
							{isPreviewOpen ? <EyeOff /> : <Eye />}
						</Button>
					)}
					{isEmail && (
						<DialogTest
							step={step}
							keys={keys}
							samples={samples}
							onSample={setSample}
							isSendingEnabled={isSendingEnabled}
							onTest={onTest}
						/>
					)}
					<Button
						variant="ghost"
						size="icon"
						aria-label="Move up"
						disabled={isLocked || index === 0}
						onClick={() => onMove(-1)}
					>
						<ArrowUp />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Move down"
						disabled={isLocked || index === count - 1}
						onClick={() => onMove(1)}
					>
						<ArrowDown />
					</Button>
					<Button variant="ghost" size="icon" aria-label="Delete step" disabled={isLocked} onClick={onDelete}>
						<Trash2 />
					</Button>
				</div>
			</div>
			{isEmail ? (
				<StepEmail
					step={step}
					keys={keys}
					samples={samples}
					onSample={setSample}
					newsletter={newsletter}
					testEmail={testEmail}
					isPreviewOpen={isPreviewOpen}
					savedLinks={savedLinks}
					onChange={onChange}
				/>
			) : (
				<StepWait step={step} onChange={onChange} />
			)}
		</div>
	);
}

function StepWait({ step, onChange }) {
	const [unit, setUnit] = useState(step.hours >= HOURS_PER_DAY && step.hours % HOURS_PER_DAY === 0 ? "days" : "hours");
	const size = unit === "days" ? HOURS_PER_DAY : 1;

	function changeAmount(event) {
		const amount = Number(event.target.value);
		onChange({
			...step,
			hours: Number.isFinite(amount) ? Math.max(0, amount) * size : 0,
		});
	}

	function changeUnit(next) {
		const amount = step.hours / size;
		setUnit(next);
		onChange({
			...step,
			hours: amount * (next === "days" ? HOURS_PER_DAY : 1),
		});
	}

	return (
		<div className="flex flex-wrap items-center gap-2 px-4 py-4 text-sm">
			<span className="text-muted-foreground">Wait</span>
			<Input
				type="number"
				min={1}
				step={1}
				value={step.hours / size || ""}
				onChange={changeAmount}
				aria-label="Wait amount"
				className="w-24 tabular-nums"
			/>
			<Select value={unit} onValueChange={changeUnit}>
				<SelectTrigger aria-label="Wait unit" className="w-28">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="hours">hours</SelectItem>
					<SelectItem value="days">days</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}

function StepEmail({ step, keys, samples, onSample, newsletter, testEmail, isPreviewOpen, savedLinks, onChange }) {
	function update(key) {
		return (event) => onChange({ ...step, [key]: event.target.value });
	}

	return (
		<div className="grid lg:grid-cols-[minmax(0,1fr)_26rem]">
			<div className="min-w-0">
				<Row label="Subject">
					<input
						value={step.subject}
						onChange={update("subject")}
						placeholder="Subject"
						maxLength={200}
						className="h-11 w-full min-w-0 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground"
					/>
				</Row>
				<Row label="Preview">
					<input
						value={step.previewText}
						onChange={update("previewText")}
						placeholder="Text shown after the subject"
						maxLength={300}
						className="h-11 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</Row>
				<EditorRich
					key={step.id}
					content={step.html}
					onChange={(html) => onChange({ ...step, html })}
					savedLinks={savedLinks}
				/>
			</div>
			<aside className="flex flex-col gap-4 border-t border-border/60 p-4 text-sm lg:border-t-0 lg:border-l">
				<div>
					<h3 className="font-medium">Variables</h3>
					{keys.length > 0 ? (
						<div className="mt-2 flex flex-col gap-2">
							{keys.map((key) => (
								<label key={key} className="flex flex-col gap-1">
									<span className="font-mono text-xs text-muted-foreground">{key}</span>
									<Input
										value={samples[key]}
										onChange={(event) => onSample(key, event.target.value)}
										aria-label={`Sample ${key}`}
										maxLength={500}
										className="h-8 text-xs"
									/>
								</label>
							))}
							<p className="text-xs text-muted-foreground">Sample values for the preview and the test.</p>
						</div>
					) : (
						<p className="mt-1 text-muted-foreground">None used yet.</p>
					)}
					<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
						Write <code className="font-mono">{"{{name}}"}</code> to use a property from the event, or{" "}
						<code className="font-mono">{"{{name|there}}"}</code> to fall back when it is missing. Links can be{" "}
						<code className="font-mono">{"{{checkout_url}}"}</code>.
					</p>
				</div>
				{isPreviewOpen && <StepPreview step={step} samples={samples} newsletter={newsletter} testEmail={testEmail} />}
			</aside>
		</div>
	);
}

function StepPreview({ step, samples, newsletter, testEmail }) {
	const deferredStep = useDeferredValue(step);
	const deferredSamples = useDeferredValue(samples);
	const rendered = useMemo(() => {
		const values = { ...deferredSamples, email: testEmail };
		return {
			subject: fillText(deferredStep.subject, values).trim(),
			previewText: fillText(deferredStep.previewText, values).trim(),
			...renderEmail({
				format: "rich",
				html: fillHtml(deferredStep.html, values),
				subject: fillText(deferredStep.subject, values).trim(),
				previewText: fillText(deferredStep.previewText, values).trim(),
				newsletter,
			}),
		};
	}, [deferredStep.subject, deferredStep.previewText, deferredStep.html, deferredSamples, testEmail, newsletter]);
	const html = useMemo(
		() => withResponsiveImages(rendered.html.replaceAll(UNSUBSCRIBE_PLACEHOLDER, "#")),
		[rendered.html],
	);

	return (
		<div className="lg:sticky lg:top-4">
			<PreviewEmail
				sender={newsletter}
				subject={rendered.subject}
				previewText={rendered.previewText}
				html={html}
				className="h-[640px]"
			/>
		</div>
	);
}

function DialogTest({ step, keys, samples, onSample, isSendingEnabled, onTest }) {
	const [isOpen, setIsOpen] = useState(false);
	const [isTesting, startTesting] = useTransition();

	function send(event) {
		event.preventDefault();
		startTesting(async () => {
			if (await onTest(step.id, samples)) setIsOpen(false);
		});
	}

	const trigger = (
		<Button
			variant="ghost"
			size="icon"
			aria-label="Send test"
			disabled={!isSendingEnabled}
			onClick={() => setIsOpen(true)}
		>
			<FlaskConical />
		</Button>
	);

	return (
		<>
			{isSendingEnabled ? (
				trigger
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<span tabIndex={0} className="rounded-lg">
							{trigger}
						</span>
					</TooltipTrigger>
					<TooltipContent>Sending is off</TooltipContent>
				</Tooltip>
			)}
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="sm:max-w-md">
					<form onSubmit={send} className="flex flex-col gap-4">
						<DialogHeader>
							<DialogTitle>Send a test</DialogTitle>
							<DialogDescription>
								{keys.length > 0 ? "Sample values for the variables in this email." : "This email has no variables."}
							</DialogDescription>
						</DialogHeader>
						{keys.map((key) => (
							<label key={key} className="flex flex-col gap-1.5 text-sm">
								<span className="font-mono text-[13px] text-muted-foreground">{key}</span>
								<Input value={samples[key]} onChange={(event) => onSample(key, event.target.value)} maxLength={500} />
							</label>
						))}
						<DialogFooter>
							<DialogClose asChild>
								<Button type="button" variant="outline">
									Cancel
								</Button>
							</DialogClose>
							<Button type="submit" disabled={isTesting}>
								{isTesting ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
								Send test
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}

function Row({ label, children }) {
	return (
		<div className="grid min-h-11 grid-cols-[4.5rem_minmax(0,1fr)] items-center border-b border-border/60 px-4 transition-colors duration-150 focus-within:bg-muted/40">
			<span className="text-sm text-muted-foreground">{label}</span>
			{children}
		</div>
	);
}
