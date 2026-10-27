import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCampaignReport, getReportWindow } from "../lib/campaign-report.js";

const HOUR = 3_600_000;
const now = new Date("2026-11-13T13:00:00Z");

test("a campaign is due 72 hours after it was sent, and only for 14 days after that", () => {
	const { sentBefore, sentAfter } = getReportWindow({ now, env: {} });
	assert.equal(sentBefore.getTime(), now.getTime() - 72 * HOUR);
	assert.equal(sentAfter.getTime(), sentBefore.getTime() - 14 * 24 * HOUR);
});

test("CAMPAIGN_REPORT_DELAY_HOURS moves the delay, and a bad value keeps 72", () => {
	assert.equal(getReportWindow({ now, env: { CAMPAIGN_REPORT_DELAY_HOURS: "24" } }).sentBefore.getTime(), now.getTime() - 24 * HOUR);
	for (const value of ["", "abc", "0", "-5"]) {
		assert.equal(getReportWindow({ now, env: { CAMPAIGN_REPORT_DELAY_HOURS: value } }).sentBefore.getTime(), now.getTime() - 72 * HOUR);
	}
});

const stats = { sent: 137, delivered: 135, opened: 60, clicked: 9, unsubscribed: 1, bounced: 2, complained: 0 };
const summary = (overrides) => ({
	sentOn: "2026-11-10",
	subject: "¿Dónde quedan tus expedientes?",
	openRate: 44.4,
	clickRate: 6.7,
	unsubscribeRate: 0.7,
	bounceRate: 1.5,
	complaintRate: 0,
	topLinks: [],
	...overrides,
});

function report(overrides = {}) {
	return formatCampaignReport({
		newsletterName: "Pandy Medical",
		stats,
		summaries: [
			summary({ topLinks: [{ url: "https://medical.pandy.cloud/", clickers: 7 }] }),
			summary({ subject: "Anterior 1", openRate: 40, clickRate: 2, unsubscribeRate: 0 }),
			summary({ subject: "Anterior 2", openRate: 36, clickRate: 4, unsubscribeRate: 1 }),
		],
		analysis: { insights: ["Clicks doubled."], suggestions: ["Keep the subject as a question."] },
		url: "https://news.pandy.cloud/campaigns/abc",
		delayHours: 72,
		...overrides,
	});
}

test("the report leads with raw counts, since one person is almost 1% of a small list", () => {
	const { subject, text } = report();
	assert.equal(subject, "Results: ¿Dónde quedan tus expedientes?");
	assert.match(text, /Pandy Medical/);
	assert.match(text, /Sent 137 · delivered 135 · opened 60 \(44\.4%\) · clicked 9 \(6\.7%\)/);
	assert.match(text, /Unsubscribed 1 \(0\.7%\) · bounced 2 \(1\.5%\) · complaints 0 \(0%\)/);
	assert.match(text, /72 hours after sending/);
	assert.match(text, /https:\/\/news\.pandy\.cloud\/campaigns\/abc/);
});

test("it compares with the average of the earlier sends, leaving this one out", () => {
	const { text } = report();
	assert.match(text, /previous 2 sends/);
	assert.match(text, /Opens 44\.4% vs 38%/);
	assert.match(text, /clicks 6\.7% vs 3%/);
	assert.match(text, /unsubscribes 0\.7% vs 0\.5%/);
});

test("the first send of a newsletter says there is nothing to compare yet", () => {
	const { text } = report({ summaries: [summary()] });
	assert.match(text, /first send/i);
	assert.doesNotMatch(text, /previous \d+ sends/);
});

test("it lists the clicked links and the AI's reading", () => {
	const { text } = report();
	assert.match(text, /https:\/\/medical\.pandy\.cloud\/: 7/);
	assert.match(text, /- Clicks doubled\./);
	assert.match(text, /- Keep the subject as a question\./);
});

test("without an analysis the numbers still go out, and the email says why the reading is missing", () => {
	const { text } = report({ analysis: null });
	assert.match(text, /Sent 137/);
	assert.match(text, /AI reading unavailable/);
	assert.doesNotMatch(text, /Clicks doubled/);
});

test("replies are named as missing, so a quiet report doesn't read as no interest", () => {
	assert.match(report().text, /Replies are not counted here/);
});

test("it warns when bounces, complaints or unsubscribes cross the line", () => {
	assert.doesNotMatch(report().text, /Warning/);
	const { text } = report({
		summaries: [summary({ bounceRate: 5.5, complaintRate: 0.2, unsubscribeRate: 2.5 })],
	});
	assert.match(text, /Warning: bounces at 5\.5%/);
	assert.match(text, /Warning: complaints at 0\.2%/);
	assert.match(text, /Warning: unsubscribes at 2\.5%/);
});
