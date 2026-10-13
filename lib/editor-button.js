import { Node } from "@tiptap/core";

// A call-to-action button (lib/buttons.js). Its label is typed in place; the link is set when it's
// inserted and changed from the link menu.
export const ButtonLink = Node.create({
	name: "button",
	group: "block",
	content: "text*",
	marks: "",
	defining: true,
	addAttributes() {
		return {
			href: {
				default: null,
				parseHTML: (element) => element.querySelector("a")?.getAttribute("href") ?? null,
				renderHTML: () => ({}),
			},
		};
	},
	parseHTML() {
		// Ahead of the paragraph's plain "p" rule (priority 50).
		return [{ tag: "p[data-button]", contentElement: "a", priority: 51 }];
	},
	renderHTML({ node }) {
		return ["p", { "data-button": "" }, ["a", { href: node.attrs.href }, 0]];
	},
});
