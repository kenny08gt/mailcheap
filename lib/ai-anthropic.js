import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export async function generateJsonWithAnthropic({ apiKey, model, system, prompt, schema, effort }) {
	const client = new Anthropic({ apiKey });
	let response;
	try {
		response = await client.messages.create({
			model,
			max_tokens: 16000,
			system,
			messages: [{ role: "user", content: prompt }],
			output_config: { effort, format: { type: "json_schema", schema } },
		});
	} catch (error) {
		if (error instanceof Anthropic.AuthenticationError) throw new Error("The AI provider rejected the API key", { cause: error });
		if (error instanceof Anthropic.RateLimitError) throw new Error("The AI provider is rate limiting requests, try again shortly", { cause: error });
		if (error instanceof Anthropic.APIError) throw new Error(`The AI provider failed (${error.status ?? "no response"})`, { cause: error });
		throw error;
	}

	if (response.stop_reason === "refusal") throw new Error("The AI declined this request. Try rewording it.");
	if (["max_tokens", "model_context_window_exceeded"].includes(response.stop_reason)) {
		throw new Error("The AI response was too long. Try a shorter brief or selection.");
	}
	let text = "";
	for (const block of response.content) if (block.type === "text") text += block.text;
	let data;
	try {
		data = JSON.parse(text);
	} catch (error) {
		throw new Error("The AI returned an unreadable answer. Try again.", { cause: error });
	}
	return {
		data,
		usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
		model,
	};
}
