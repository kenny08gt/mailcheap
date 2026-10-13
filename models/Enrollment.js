import mongoose from "mongoose";

export const ENROLLMENT_STATUSES = ["active", "completed", "exited"];

const enrollmentSchema = new mongoose.Schema(
	{
		automationId: { type: mongoose.Schema.Types.ObjectId, ref: "Automation", required: true },
		newsletterId: { type: mongoose.Schema.Types.ObjectId, ref: "Newsletter", required: true },
		contactId: { type: mongoose.Schema.Types.ObjectId, ref: "Contact", required: true },
		status: { type: String, enum: ENROLLMENT_STATUSES, default: "active" },
		stepId: { type: String, default: null },
		stepIndex: { type: Number, default: 0 },
		nextAt: { type: Date },
		lockedUntil: { type: Date },
		properties: { type: mongoose.Schema.Types.Mixed, default: {} },
		exitReason: { type: String },
		enrolledAt: { type: Date, default: Date.now },
		endedAt: { type: Date },
	},
	{ timestamps: true, minimize: false }
);

enrollmentSchema.index(
	{ automationId: 1, contactId: 1 },
	{ unique: true, partialFilterExpression: { status: "active" } }
);
enrollmentSchema.index({ status: 1, nextAt: 1 });
enrollmentSchema.index({ contactId: 1, status: 1 });
enrollmentSchema.index({ automationId: 1, contactId: 1, enrolledAt: -1 });
enrollmentSchema.index({ automationId: 1, enrolledAt: -1 });

export default mongoose.models.Enrollment || mongoose.model("Enrollment", enrollmentSchema);
