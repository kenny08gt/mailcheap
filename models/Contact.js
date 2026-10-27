import mongoose from "mongoose";
import { AUDIENCE_SORT } from "../lib/audience.js";

// pending: signed up to a newsletter that asks new subscribers to confirm, and hasn't yet.
export const CONTACT_STATUSES = ["active", "pending", "unsubscribed", "bounced", "complained", "dormant"];

const contactSchema = new mongoose.Schema(
	{
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		email: { type: String, required: true, lowercase: true, trim: true },
		status: { type: String, enum: CONTACT_STATUSES, default: "active" },
		source: { type: String, trim: true },
		subscribedAt: { type: Date, default: Date.now },
		confirmedAt: { type: Date },
		unsubscribedAt: { type: Date },
		lastSentAt: { type: Date },
		lastOpenAt: { type: Date },
		lastClickAt: { type: Date },
		// List cleanup (lib/cleanup.js): issues received since the last sign of life (open, click,
		// confirmation, signup, "keep sending it" click), when that was, and when the last-chance email went out.
		ignoredIssues: { type: Number },
		lastEngagedAt: { type: Date },
		lastChanceAt: { type: Date },
		// The list hygiene (lib/list-hygiene.js) stopped it as bounced: why, when, and the status to give back once the
		// domain takes email again. Never a suppression, so it can be undone; a real bounce has none of these.
		undeliverableReason: { type: String, enum: ["no-mail-server"] },
		undeliverableAt: { type: Date },
		undeliverableFrom: { type: String },
		stats: {
			sent: { type: Number, default: 0 },
			opens: { type: Number, default: 0 },
			clicks: { type: Number, default: 0 },
		},
		// From a CSV import: engagement on the previous platform, so sends reach the most engaged first.
		imported: {
			emailsReceived: { type: Number },
			openRate: { type: Number },
			clickRate: { type: Number },
		},
	},
	{ timestamps: true }
);

contactSchema.index({ newsletterId: 1, email: 1 }, { unique: true });
contactSchema.index({ newsletterId: 1, status: 1, createdAt: -1 });
contactSchema.index({ email: 1 });
// The contacts list shows the newest subscribers first, with or without newsletter and status filters.
// It breaks ties by _id, which the index needs too: without it MongoDB sorts the whole list on every page.
contactSchema.index({ subscribedAt: -1, _id: -1 });
contactSchema.index({ status: 1, subscribedAt: -1, _id: -1 });
contactSchema.index({ newsletterId: 1, subscribedAt: -1, _id: -1 });
contactSchema.index({ newsletterId: 1, status: 1, subscribedAt: -1, _id: -1 });
// A send reads its audience in this order, most engaged first (lib/audience.js). Without it MongoDB sorts the whole list
// in memory, and a send to a list past its 32 MB limit fails.
contactSchema.index({ newsletterId: 1, status: 1, ...AUDIENCE_SORT });
// The list cleanup totals in newsletter settings.
contactSchema.index({ newsletterId: 1, lastChanceAt: 1 }, { partialFilterExpression: { lastChanceAt: { $exists: true } } });

export default mongoose.models.Contact || mongoose.model("Contact", contactSchema);
