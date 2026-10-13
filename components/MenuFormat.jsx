"use client";

import { useId, useMemo } from "react";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { Bold, CornerDownLeft, Heading1, Heading2, Italic, Link, Strikethrough, TextQuote, Unlink } from "lucide-react";
import { isWholeVariable } from "@/lib/automation-variables";
import { cn } from "@/lib/utils";

export default function MenuFormat({ editor, isEditingLink, onEditLink, savedLinks = [] }) {
	const linksId = useId();
	const state = useEditorState({
		editor,
		selector: ({ editor: current }) => ({
			isBold: current.isActive("bold"),
			isItalic: current.isActive("italic"),
			isStrike: current.isActive("strike"),
			isLink: current.isActive("link"),
			href: current.getAttributes("link").href ?? "",
			// A button's link is the node's own, not a link mark on its label.
			isButton: current.isActive("button"),
			buttonHref: current.getAttributes("button").href ?? "",
			isTitle: current.isActive("heading", { level: 1 }),
			isHeading: current.isActive("heading", { level: 2 }),
			isQuote: current.isActive("blockquote"),
		}),
	});
	const options = useMemo(
		() => ({ placement: "top", offset: 8, flip: true, shift: { padding: 8 }, onHide: () => onEditLink(false) }),
		[onEditLink]
	);

	function closeLink() {
		onEditLink(false);
		editor.commands.focus();
	}

	function applyLink(event) {
		event.preventDefault();
		const href = normalizeUrl(new FormData(event.currentTarget).get("href"));
		if (state.isButton) {
			if (href) editor.chain().focus().updateAttributes("button", { href }).run();
			return onEditLink(false);
		}
		const chain = editor.chain().focus().extendMarkRange("link");
		(href ? chain.setLink({ href }) : chain.unsetLink()).run();
		onEditLink(false);
	}

	function removeLink() {
		editor.chain().focus().extendMarkRange("link").unsetLink().run();
		onEditLink(false);
	}

	return (
		<BubbleMenu editor={editor} shouldShow={shouldShowMenu} appendTo={getBody} options={options} className="z-50">
			<div className="flex items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg">
				{isEditingLink ? (
					<form onSubmit={applyLink} className="flex items-center gap-0.5">
						<input
							name="href"
							type="text"
							inputMode="url"
							autoFocus
							defaultValue={state.isButton ? state.buttonHref : state.href}
							placeholder={savedLinks.length > 0 ? "Paste or pick a link" : "Paste a link"}
							aria-label="Link"
							list={savedLinks.length > 0 ? linksId : undefined}
							onKeyDown={(event) => event.key === "Escape" && closeLink()}
							className="h-8 w-60 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
						/>
						{savedLinks.length > 0 && (
							<datalist id={linksId}>
								{savedLinks.map(({ label, url }) => (
									<option key={url} value={url} label={label} />
								))}
							</datalist>
						)}
						{state.isLink && !state.isButton && (
							<ButtonFormat label="Remove link" onClick={removeLink}>
								<Unlink />
							</ButtonFormat>
						)}
						<ButtonFormat label="Apply link" type="submit">
							<CornerDownLeft />
						</ButtonFormat>
					</form>
				) : (
					<>
						<ButtonFormat label="Bold" isActive={state.isBold} onClick={() => editor.chain().focus().toggleBold().run()}>
							<Bold />
						</ButtonFormat>
						<ButtonFormat
							label="Italic"
							isActive={state.isItalic}
							onClick={() => editor.chain().focus().toggleItalic().run()}
						>
							<Italic />
						</ButtonFormat>
						<ButtonFormat
							label="Strikethrough"
							isActive={state.isStrike}
							onClick={() => editor.chain().focus().toggleStrike().run()}
						>
							<Strikethrough />
						</ButtonFormat>
						<ButtonFormat label="Link (⌘K)" isActive={state.isLink} onClick={() => onEditLink(true)}>
							<Link />
						</ButtonFormat>
						<span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
						<ButtonFormat
							label="Heading 1"
							isActive={state.isTitle}
							onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
						>
							<Heading1 />
						</ButtonFormat>
						<ButtonFormat
							label="Heading 2"
							isActive={state.isHeading}
							onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
						>
							<Heading2 />
						</ButtonFormat>
						<ButtonFormat
							label="Quote"
							isActive={state.isQuote}
							onClick={() => editor.chain().focus().toggleBlockquote().run()}
						>
							<TextQuote />
						</ButtonFormat>
					</>
				)}
			</div>
		</BubbleMenu>
	);
}

function ButtonFormat({ label, isActive, type = "button", onClick, children }) {
	return (
		<button
			type={type}
			aria-label={label}
			title={label}
			aria-pressed={isActive}
			onClick={onClick}
			className={cn(
				"grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground [&_svg]:size-4",
				isActive && "bg-accent text-foreground"
			)}
		>
			{children}
		</button>
	);
}

// The editor's card clips its overflow, which would cut the menu off at the top of the content.
function getBody() {
	return document.body;
}

// Text selections only: images and dividers have nothing to format.
function shouldShowMenu({ editor, view, state, from, to }) {
	if (!editor.isEditable || from === to || state.selection instanceof NodeSelection) return false;
	return view.hasFocus();
}

function normalizeUrl(value) {
	const url = String(value ?? "").trim();
	if (!url || /^(https?:|mailto:)/i.test(url) || isWholeVariable(url)) return url;
	if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(url)) return `mailto:${url}`;
	return `https://${url}`;
}
