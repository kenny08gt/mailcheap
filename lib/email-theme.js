// A newsletter's email colors. Each one is optional, and an email with none set looks exactly as it
// did before themes existed: `swatch` is the color the picker shows while a field is empty.
export const THEME_COLORS = [
	{ key: "background", label: "Page", hint: "Behind the email", swatch: "#ffffff" },
	{ key: "card", label: "Card", hint: "Sets the content in a bordered, rounded card", swatch: "#ffffff" },
	{ key: "text", label: "Text", hint: "Paragraphs and headings", swatch: "#27272a" },
	{ key: "muted", label: "Muted text", hint: "Footer, quotes and the Read online link", swatch: "#71717a" },
	{ key: "line", label: "Lines", hint: "Borders and dividers", swatch: "#e4e4e7" },
	{ key: "link", label: "Links", hint: "Links in the text", swatch: "#18181b" },
	{ key: "accent", label: "Buttons", hint: "Button background", swatch: "#18181b" },
	{ key: "accentText", label: "Button text", swatch: "#ffffff" },
	{
		key: "headerBackground",
		label: "Header",
		hint: "Without a header image, shows a band in this color with the logo and name",
		swatch: "#18181b",
	},
];

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexColor(value) {
	return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

// Form values to a theme to save. Empty fields stay unset.
export function parseTheme(values) {
	const theme = {};
	for (const { key, label } of THEME_COLORS) {
		const value = String(values?.[key] ?? "").trim();
		if (!value) continue;
		if (!isHexColor(value)) return { error: `${label} color must look like #f7f5ef` };
		theme[key] = value.toLowerCase();
	}
	return { theme };
}

// Light text on a dark header, dark text on a light one.
function readableOn(background) {
	const [r, g, b] = [1, 3, 5].map((start) => {
		const channel = parseInt(background.slice(start, start + 2), 16) / 255;
		return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#18181b" : "#ffffff";
}

// Every color an email uses. The previews pass colors as they are typed, so invalid ones are dropped.
export function getEmailPalette(theme) {
	const color = (key) => (isHexColor(theme?.[key]) ? theme[key] : undefined);
	const muted = color("muted");
	const background = color("background");
	const card = color("card");
	const header = color("headerBackground");
	return {
		background: background ?? "#ffffff",
		card,
		text: color("text") ?? "#27272a",
		heading: color("text") ?? "#09090b",
		muted: muted ?? "#71717a",
		quote: muted ?? "#52525b",
		faint: muted ?? "#a1a1aa",
		line: color("line") ?? "#e4e4e7",
		// Boxes and code take the page color inside a card.
		surface: (card && background) || "#f4f4f5",
		link: color("link") ?? "#18181b",
		accent: color("accent") ?? "#18181b",
		accentText: color("accentText") ?? "#ffffff",
		header,
		headerText: header && readableOn(header),
	};
}
