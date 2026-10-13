"use client";

import { useState, useTransition } from "react";
import { getHTMLFromFragment } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { analyzeCampaigns, draftCampaign, rewriteSelection } from "@/app/(app)/campaigns/assistant-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_ANALYSIS_LIMIT, MAX_BRIEF_LENGTH } from "@/lib/ai-assistant";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODEL_KEY = "mailcheap:ai-model";

const PRESETS = [
	{ id: "shorter", label: "Shorter" },
	{ id: "formal", label: "More formal" },
	{ id: "urgent", label: "More urgent" },
];

function formatUsd(value) {
	if (value === null || value === undefined) return null;
	return value > 0 && value < 0.01 ? "<$0.01" : `$${value.toFixed(2)}`;
}

// The part of the document a rewrite replaces. Within one paragraph only its inline content goes, so
// the answer slots back in without splitting the paragraph.
function readSelection(editor) {
	const { from, to, $from, $to } = editor.state.selection;
	const isInline = $from.sameParent($to) && $from.parent.isTextblock;
	const fragment = isInline
		? $from.parent.content.cut($from.parentOffset, $to.parentOffset)
		: editor.state.doc.slice(from, to).content;
	return { from, to, isInline, html: getHTMLFromFragment(fragment, editor.schema), doc: editor.state.doc };
}

function readStoredModel(models) {
	try {
		const stored = localStorage.getItem(MODEL_KEY);
		return models.some(({ id }) => id === stored) ? stored : null;
	} catch {
		return null;
	}
}

export default function CardAssistant({ campaignId, editor, initialSpend, models, defaultModel, onDraft }) {
	const [isOpen, setIsOpen] = useState(false);
	const [pickedModel, setPickedModel] = useState(null);
	const model = pickedModel ?? defaultModel;
	const [tab, setTab] = useState("draft");
	const [brief, setBrief] = useState("");
	const [isConfirming, setIsConfirming] = useState(false);
	const [instruction, setInstruction] = useState("");
	const [analysis, setAnalysis] = useState(null);
	const [lastCall, setLastCall] = useState(null);
	const [spend, setSpend] = useState(initialSpend);
	const [activeKind, setActiveKind] = useState(null);
	const [isPending, startTransition] = useTransition();
	const hasSelection = useEditorState({
		editor,
		selector: ({ editor: current }) => Boolean(current && !current.state.selection.empty),
	});

	function run(kind, request, apply) {
		setActiveKind(kind);
		startTransition(async () => {
			const result = await request();
			if (result?.error) return void toast.error(result.error);
			setLastCall(result.usage);
			setSpend(result.spend);
			apply(result);
		});
	}

	function generate() {
		if (!editor) return;
		if (!editor.isEmpty && !isConfirming) return setIsConfirming(true);
		setIsConfirming(false);
		run("draft", () => draftCampaign(campaignId, brief, model), ({ draft }) => {
			if (editor.isDestroyed) return;
			editor.commands.setContent(draft.html);
			onDraft({ subject: draft.subject, previewText: draft.previewText });
			toast.success("Draft inserted. Review it before sending.");
		});
	}

	function rewrite(options) {
		if (!editor || editor.state.selection.empty) return;
		const selection = readSelection(editor);
		run(
			"rewrite",
			() => rewriteSelection(campaignId, { html: selection.html, isInline: selection.isInline, model, ...options }),
			({ html }) => {
				if (editor.isDestroyed) return;
				if (editor.state.doc !== selection.doc) {
					return void toast.error("The content changed while rewriting. Select the text and try again.");
				}
				editor.chain().focus().insertContentAt({ from: selection.from, to: selection.to }, html).run();
			}
		);
	}

	// Read on first open, since the card renders closed on the server.
	function toggle() {
		if (!isOpen && pickedModel === null) setPickedModel(readStoredModel(models));
		setIsOpen(!isOpen);
	}

	function pickModel(id) {
		setPickedModel(id);
		try {
			localStorage.setItem(MODEL_KEY, id);
		} catch {}
	}

	function applySuggestions() {
		setBrief(analysis.suggestions.map((suggestion) => `- ${suggestion}`).join("\n"));
		setTab("draft");
	}

	function spinner(kind) {
		return isPending && activeKind === kind ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null;
	}

	return (
		<div className="rounded-xl bg-card shadow-border">
			<button
				type="button"
				onClick={toggle}
				aria-expanded={isOpen}
				className="flex h-11 w-full items-center gap-2 px-4 text-sm font-medium"
			>
				<Sparkles className="size-4 text-muted-foreground" />
				Assistant
				{isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
				<ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
			</button>

			{isOpen && (
				<div className="flex flex-col gap-3 border-t border-border/60 p-4">
					<Tabs value={tab} onValueChange={setTab}>
						<TabsList className="w-full">
							<TabsTrigger value="draft">Draft</TabsTrigger>
							<TabsTrigger value="rewrite">Rewrite</TabsTrigger>
							<TabsTrigger value="analyze">Analyze</TabsTrigger>
						</TabsList>

						<TabsContent value="draft" className="flex flex-col gap-2 pt-1">
							<Textarea
								value={brief}
								onChange={(event) => setBrief(event.target.value)}
								placeholder="What is this campaign about? Audience, key points, links, call to action."
								maxLength={MAX_BRIEF_LENGTH}
								rows={3}
								className="max-h-48"
							/>
							{isConfirming ? (
								<div className="flex items-center gap-2">
									<span className="mr-auto text-xs text-muted-foreground">
										Replace the subject, preview text and content?
									</span>
									<Button size="sm" variant="ghost" onClick={() => setIsConfirming(false)}>
										Cancel
									</Button>
									<Button size="sm" onClick={generate}>
										Replace
									</Button>
								</div>
							) : (
								<Button size="sm" className="self-end" onClick={generate} disabled={isPending || !brief.trim()}>
									{spinner("draft")}
									Generate
								</Button>
							)}
						</TabsContent>

						<TabsContent value="rewrite" className="flex flex-col gap-2 pt-1">
							{!hasSelection && (
								<p className="text-xs text-muted-foreground">Select text in the editor to rewrite it.</p>
							)}
							<div className="flex flex-wrap gap-2">
								{PRESETS.map(({ id, label }) => (
									<Button
										key={id}
										size="sm"
										variant="outline"
										disabled={isPending || !hasSelection}
										onClick={() => rewrite({ preset: id })}
									>
										{label}
									</Button>
								))}
							</div>
							<form
								className="flex gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									rewrite({ instruction });
								}}
							>
								<Input
									value={instruction}
									onChange={(event) => setInstruction(event.target.value)}
									placeholder="Or say how, e.g. add a call to action"
									maxLength={500}
									className="h-7 text-sm"
								/>
								<Button size="sm" type="submit" disabled={isPending || !hasSelection || !instruction.trim()}>
									{spinner("rewrite")}
									Rewrite
								</Button>
							</form>
						</TabsContent>

						<TabsContent value="analyze" className="flex flex-col gap-3 pt-1">
							<div className="flex items-center gap-2">
								<span className="mr-auto text-xs text-muted-foreground">
									Results of the last {DEFAULT_ANALYSIS_LIMIT} sent campaigns, with ideas for this one.
								</span>
								<Button
									size="sm"
									variant="outline"
									disabled={isPending}
									onClick={() =>
										run("analysis", () => analyzeCampaigns(campaignId, model), (result) => setAnalysis(result.analysis))
									}
								>
									{spinner("analysis")}
									Analyze
								</Button>
							</div>
							{analysis && (
								<div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
									<ListInsights title="Insights" items={analysis.insights} />
									<ListInsights title="Suggestions" items={analysis.suggestions} />
									{analysis.suggestions.length > 0 && (
										<Button size="sm" variant="outline" className="self-start" onClick={applySuggestions}>
											Use as brief
										</Button>
									)}
								</div>
							)}
						</TabsContent>
					</Tabs>

					<div className="flex items-center gap-2">
						<span className="mr-auto text-xs text-muted-foreground">Model</span>
						<Select value={model} onValueChange={pickModel} disabled={isPending}>
							<SelectTrigger size="sm" className="text-xs" aria-label="Model">
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="end">
								{models.map(({ id, label }) => (
									<SelectItem key={id} value={id}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{isPending && <p className="text-xs text-muted-foreground">Working on it. This can take up to a minute.</p>}
					<p className="text-xs text-muted-foreground tabular-nums">
						{lastCall &&
							`This call: ${formatNumber(lastCall.inputTokens + lastCall.outputTokens)} tokens${lastCall.costUsd === null ? "" : ` ≈ ${formatUsd(lastCall.costUsd)}`} · `}
						Last 30 days ≈{" "}
						{spend.costUsd === 0 && spend.tokens > 0 ? `${formatNumber(spend.tokens)} tokens` : formatUsd(spend.costUsd)}
					</p>
				</div>
			)}
		</div>
	);
}

function ListInsights({ title, items }) {
	if (items.length === 0) return null;
	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-xs font-medium text-muted-foreground">{title}</span>
			<ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
				{items.map((item) => (
					<li key={item}>{item}</li>
				))}
			</ul>
		</div>
	);
}
