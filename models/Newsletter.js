import mongoose from "mongoose";

const newsletterSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
		imageUrl: { type: String, trim: true },
		fromName: { type: String, trim: true },
		fromEmail: { type: String, required: true, lowercase: true, trim: true },
		replyTo: { type: String, lowercase: true, trim: true },
		postalAddress: { type: String, trim: true },
		archiveEnabled: { type: Boolean, default: false },
		description: { type: String, trim: true },
		socialLinks: [{ type: String, trim: true }],
		// The email footer shows the known social links as icons under this line (lib/social.js).
		footerSocial: {
			enabled: { type: Boolean, default: false },
			text: { type: String, trim: true },
		},
		// The "home" link: the banner points at it, and the editor and AI assistant offer it first.
		websiteUrl: { type: String, trim: true },
		// Banner at the top of every email.
		headerImageUrl: { type: String, trim: true },
		// Email colors, each "#rrggbb" or unset for the default (lib/email-theme.js).
		theme: {
			background: String,
			card: String,
			text: String,
			muted: String,
			line: String,
			link: String,
			accent: String,
			accentText: String,
			headerBackground: String,
		},
		// Named links offered when adding a link or button, and to the AI assistant (lib/brand-links.js).
		links: [
			new mongoose.Schema({ label: { type: String, trim: true }, url: { type: String, trim: true } }, { _id: false }),
		],
		// Tags links to these domains (every external link when empty) when an issue is sent (lib/utm.js).
		utm: {
			enabled: { type: Boolean, default: false },
			domains: [{ type: String, trim: true, lowercase: true }],
		},
		// The archive's author page; the author's name is fromName.
		author: {
			bio: { type: String, trim: true },
			imageUrl: { type: String, trim: true },
		},
		// New signups get an email with a link and only join once they click it (confirmed opt-in).
		requireConfirmation: { type: Boolean, default: false },
		// Checked when an issue is sent (lib/cleanup.js). Empty numbers use the newsletter's defaults.
		cleanup: {
			enabled: { type: Boolean, default: false },
			issues: { type: Number, min: 1 },
			days: { type: Number, min: 1 },
		},
		welcome: {
			enabled: { type: Boolean, default: false },
			subject: { type: String, trim: true },
			previewText: { type: String, trim: true },
			markdown: { type: String },
		},
		// The newsletter's own confirmation email; the built-in one goes out until it has one.
		confirmation: {
			subject: { type: String, trim: true },
			previewText: { type: String, trim: true },
			markdown: { type: String },
		},
	},
	{ timestamps: true }
);

export default mongoose.models.Newsletter || mongoose.model("Newsletter", newsletterSchema);
