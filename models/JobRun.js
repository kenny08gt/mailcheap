import mongoose from "mongoose";

const jobRunSchema = new mongoose.Schema(
	{
		_id: { type: String },
		ranAt: { type: Date },
		result: { type: mongoose.Schema.Types.Mixed },
	},
	{ versionKey: false }
);

export default mongoose.models.JobRun || mongoose.model("JobRun", jobRunSchema);
