"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isWholeVariable } from "@/lib/automation-variables";
import { isHttpsUrl } from "@/lib/brand-links";
import { cn } from "@/lib/utils";

// Asks for a button's label and link; the newsletter's saved links are one click away.
export default function DialogInsertButton({ isOpen, onOpenChange, savedLinks, onInsert }) {
	const [label, setLabel] = useState("");
	const [href, setHref] = useState("");
	const url = normalizeUrl(href);
	const isValid = Boolean(label.trim()) && (isHttpsUrl(url) || isWholeVariable(url));

	// Cleared on the way out, so the next button starts empty.
	function changeOpen(nextIsOpen) {
		if (!nextIsOpen) {
			setLabel("");
			setHref("");
		}
		onOpenChange(nextIsOpen);
	}

	function submit(event) {
		event.preventDefault();
		if (!isValid) return;
		onInsert({ label: label.trim(), href: url });
		changeOpen(false);
	}

	return (
		<Dialog open={isOpen} onOpenChange={changeOpen}>
			<DialogContent className="sm:max-w-md">
				<form onSubmit={submit} className="flex flex-col gap-4">
					<DialogHeader>
						<DialogTitle>Insert button</DialogTitle>
						<DialogDescription>A call to action readers can&apos;t miss.</DialogDescription>
					</DialogHeader>
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="text-muted-foreground">Label</span>
						<Input
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="Compra tu entrada"
							maxLength={60}
							autoFocus
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="text-muted-foreground">Link</span>
						<Input
							value={href}
							onChange={(event) => setHref(event.target.value)}
							inputMode="url"
							placeholder="https://example.com/tickets"
							className="font-mono text-[13px]"
						/>
					</label>
					{savedLinks.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{savedLinks.map((link) => (
								<button
									key={link.url}
									type="button"
									title={link.url}
									onClick={() => {
										setHref(link.url);
										if (!label.trim()) setLabel(link.label);
									}}
									className={cn(
										"rounded-md border px-2 py-1 text-xs transition-colors duration-150 hover:bg-accent",
										href === link.url && "border-foreground/40 bg-accent"
									)}
								>
									{link.label}
								</button>
							))}
						</div>
					)}
					<DialogFooter>
						<DialogClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</DialogClose>
						<Button type="submit" disabled={!isValid}>
							Insert
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function normalizeUrl(value) {
	const url = value.trim();
	return !url || /^https?:/i.test(url) || isWholeVariable(url) ? url : `https://${url}`;
}
