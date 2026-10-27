import mongoose from "mongoose";

export const MESSAGE_STATUSES = [
	"queued",
	"sent",
	"delivered",
	"bounced",
	"complained",
	"failed",
	"suppressed",
];

const messageSchema = new mongoose.Schema(
	{
		kind: { type: String, enum: ["campaign", "last-chance", "welcome", "confirmation", "test", "automation"], required: true },
		campaignId: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
		automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation" },
		enrollmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment" },
		stepId: { type: String },
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact" },
		email: { type: String, required: true, lowercase: true, trim: true },
		provider: { type: String },
		status: { type: String, enum: MESSAGE_STATUSES, default: "queued" },
		sesMessageId: { type: String },
		error: { type: String },
		sentAt: Date,
		deliveredAt: Date,
		openedAt: Date,
		clickedAt: Date,
		// Every link this contact clicked, once each, so a campaign's links count unique clickers.
		clickedUrls: { type: [String], default: undefined },
		bouncedAt: Date,
		complainedAt: Date,
		// Set when this email's unsubscribe link was used (app/api/unsubscribe), so the report can list who left.
		unsubscribedAt: Date,
	},
	{ timestamps: true }
);

// One email per contact per campaign, even if a send job is retried.
messageSchema.index(
	{ campaignId: 1, contactId: 1 },
	{ unique: true, partialFilterExpression: { kind: "campaign" } }
);
// And at most one last-chance email per contact per send.
messageSchema.index(
	{ campaignId: 1, contactId: 1, kind: 1 },
	{ unique: true, partialFilterExpression: { kind: "last-chance" } }
);
messageSchema.index(
	{ enrollmentId: 1, stepId: 1 },
	{ unique: true, partialFilterExpression: { kind: "automation" } }
);
messageSchema.index({ automationId: 1, stepId: 1, status: 1 }, { partialFilterExpression: { kind: "automation" } });
messageSchema.index({ sesMessageId: 1 }, { sparse: true });
messageSchema.index({ kind: 1, createdAt: -1 });
// The overview's emails sent per hour.
messageSchema.index({ newsletterId: 1, sentAt: 1 });
messageSchema.index({ campaignId: 1, status: 1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
