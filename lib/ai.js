import "server-only";
import { getCostUsd, getDefaultModel } from "@/lib/ai-assistant";
import { generateJsonWithAnthropic } from "@/lib/ai-anthropic";
import { isAiEnabled } from "@/lib/config";
import AiUsage from "@/models/AiUsage";

// One entry per provider. A second one (e.g. "openai-compatible" with a baseURL, for Kimi or DeepSeek)
// takes the same request and returns the same { data, usage, model }, and joins AI_PROVIDERS in
// lib/config.js.
const ADAPTERS = {
	anthropic: generateJsonWithAnthropic,
};

const SPEND_DAYS = 30;

// The callers connect to the database first, and check a requested model with resolveModel.
export async function generateJson({ kind, model = getDefaultModel(), system, prompt, schema, effort = "medium" }) {
	const adapter = ADAPTERS[process.env.AI_PROVIDER || "anthropic"];
	if (!isAiEnabled() || !adapter) throw new Error("The AI assistant is not configured");

	const result = await adapter({
		apiKey: process.env.AI_API_KEY,
		model,
		system,
		prompt,
		schema,
		effort,
	});
	const costUsd = getCostUsd(result.model, result.usage);
	await AiUsage.create({ kind, model: result.model, ...result.usage, costUsd });
	return { ...result, usage: { ...result.usage, costUsd } };
}

export async function getRecentAiSpend() {
	const since = new Date(Date.now() - SPEND_DAYS * 86_400_000);
	const [row] = await AiUsage.aggregate([
		{ $match: { createdAt: { $gte: since } } },
		{ $group: { _id: null, costUsd: { $sum: "$costUsd" }, tokens: { $sum: { $add: ["$inputTokens", "$outputTokens"] } } } },
	]);
	return { costUsd: row?.costUsd ?? 0, tokens: row?.tokens ?? 0 };
}
