import mongoose from "mongoose";

// The last run of each background job, keyed by job name, so the dashboard can tell when one stopped.
const jobRunSchema = new mongoose.Schema(
	{
		_id: { type: String },
		ranAt: { type: Date },
		result: { type: mongoose.Schema.Types.Mixed },
	},
	{ versionKey: false }
);

export default mongoose.models.JobRun || mongoose.model("JobRun", jobRunSchema);
