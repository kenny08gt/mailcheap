"use server";

import { isValidObjectId } from "mongoose";
import { generateJson, getRecentAiSpend } from "@/lib/ai";
import {
	ANALYSIS_SCHEMA,
	DEFAULT_ANALYSIS_LIMIT,
	DRAFT_SCHEMA,
	MAX_BRIEF_LENGTH,
	MAX_SELECTION_LENGTH,
	REWRITE_PRESETS,
	REWRITE_SCHEMA,
	buildAnalysisPrompt,
	buildDraftPrompt,
	buildRewritePrompt,
	buildSystemPrompt,
	normalizeAnalysis,
	normalizeDraft,
	normalizeRewrite,
	summarizeCampaigns,
} from "@/lib/ai-assistant";
import { requireSession } from "@/lib/auth";
import { getLinkClicks, getProviderBreakdowns } from "@/lib/campaign-engagement";
import { isAiEnabled } from "@/lib/config";
import { connectDb } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";
import Campaign from "@/models/Campaign";
import Newsletter from "@/models/Newsletter";

// Each call costs money and takes up to a minute; this only stops a stuck button or a loop.
const PER_SESSION = { name: "ai-assistant", limit: 30, window: "1 h" };

async function withNewsletter(campaignId, run) {
	const session = await requireSession();
	if (!isAiEnabled()) return { error: "The AI assistant is not configured" };
	if (!isValidObjectId(campaignId)) return { error: "Campaign not found" };
	if (await isRateLimited({ ...PER_SESSION, key: session.email })) {
		return { error: "Too many AI requests. Try again in a while." };
	}
	await connectDb();
	const campaign = await Campaign.findById(campaignId).select("newsletterId").lean();
	const newsletter = campaign && (await Newsletter.findById(campaign.newsletterId).select("name fromName").lean());
	if (!newsletter) return { error: "Campaign not found" };

	try {
		const system = buildSystemPrompt({ newsletterName: newsletter.name, fromName: newsletter.fromName });
		const { result, usage } = await run({ system, newsletter });
		return { ok: true, ...result, usage, spend: await getRecentAiSpend() };
	} catch (error) {
		console.error("[assistant] AI request failed:", error);
		return { error: error.message || "The AI request failed" };
	}
}

export async function draftCampaign(campaignId, brief) {
	const text = String(brief ?? "").trim();
	if (!text) return { error: "Describe the campaign first" };
	if (text.length > MAX_BRIEF_LENGTH) return { error: `Keep the brief under ${MAX_BRIEF_LENGTH} characters` };

	return withNewsletter(campaignId, async ({ system }) => {
		const { data, usage } = await generateJson({
			kind: "draft",
			system,
			prompt: buildDraftPrompt(text),
			schema: DRAFT_SCHEMA,
		});
		const draft = normalizeDraft(data);
		if (!draft.html) throw new Error("The AI returned an empty draft. Try again.");
		return { result: { draft }, usage };
	});
}

export async function rewriteSelection(campaignId, { html, preset, instruction, isInline } = {}) {
	const selection = String(html ?? "").trim();
	const request = REWRITE_PRESETS[preset] ?? String(instruction ?? "").trim().slice(0, 500);
	if (!selection) return { error: "Select some text first" };
	if (selection.length > MAX_SELECTION_LENGTH) return { error: "The selection is too long" };
	if (!request) return { error: "Say how to rewrite it" };

	return withNewsletter(campaignId, async ({ system }) => {
		const { data, usage } = await generateJson({
			kind: "rewrite",
			system,
			prompt: buildRewritePrompt({ html: selection, instruction: request, isInline: Boolean(isInline) }),
			schema: REWRITE_SCHEMA,
			effort: "low",
		});
		const rewrite = normalizeRewrite(data, { isInline: Boolean(isInline) });
		if (!rewrite.html) throw new Error("The AI returned an empty rewrite. Try again.");
		return { result: { html: rewrite.html }, usage };
	});
}

export async function analyzeCampaigns(campaignId) {
	return withNewsletter(campaignId, async ({ system, newsletter }) => {
		const campaigns = await Campaign.find({ newsletterId: newsletter._id, status: "sent" })
			.sort({ sentAt: -1 })
			.limit(DEFAULT_ANALYSIS_LIMIT)
			.select("subject previewText format html markdown stats sentAt")
			.lean();
		if (campaigns.length === 0) throw new Error("This newsletter has no sent campaigns to analyze yet");

		const ids = campaigns.map(({ _id }) => _id);
		const [providers, links] = await Promise.all([getProviderBreakdowns(ids), getLinkClicks(ids)]);
		const { data, usage } = await generateJson({
			kind: "analysis",
			system,
			prompt: buildAnalysisPrompt({
				newsletterName: newsletter.name,
				campaigns: summarizeCampaigns(campaigns, { providers, links }),
			}),
			schema: ANALYSIS_SCHEMA,
		});
		return { result: { analysis: normalizeAnalysis(data), count: campaigns.length }, usage };
	});
}
