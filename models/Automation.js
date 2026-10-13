import mongoose from "mongoose";

export const AUTOMATION_STATUSES = ["draft", "active", "paused"];

const automationSchema = new mongoose.Schema(
	{
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		name: { type: String, trim: true, default: "" },
		status: { type: String, enum: AUTOMATION_STATUSES, default: "draft" },
		trigger: { event: { type: String, default: "contact_active" } },
		exitOn: { type: [String], default: [] },
		reentry: {
			allowed: { type: Boolean, default: false },
			cooldownDays: { type: Number, min: 1 },
		},
		steps: { type: [mongoose.Schema.Types.Mixed], default: [] },
	},
	{ timestamps: true }
);

automationSchema.index({ newsletterId: 1, status: 1, "trigger.event": 1 });
automationSchema.index({ exitOn: 1 });

export default mongoose.models.Automation || mongoose.model("Automation", automationSchema);
