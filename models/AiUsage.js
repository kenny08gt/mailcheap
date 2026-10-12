import mongoose from "mongoose";

const aiUsageSchema = new mongoose.Schema({
	kind: { type: String, enum: ["draft", "rewrite", "analysis"], required: true },
	model: { type: String, required: true },
	inputTokens: { type: Number, required: true },
	outputTokens: { type: Number, required: true },
	// Null for a model without a known price.
	costUsd: { type: Number, default: null },
	createdAt: { type: Date, default: Date.now },
});

aiUsageSchema.index({ createdAt: -1 });

export default mongoose.models.AiUsage || mongoose.model("AiUsage", aiUsageSchema);
