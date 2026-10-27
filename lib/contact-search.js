function escapeRegex(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// What a search matches: its text anywhere in an address, where * stands for any characters, as in *@example.com or
// jane*@example.com. null when there's nothing to look for. Each part only has to come after the one before, so the first
// place it fits is as good as any: atomic groups keep MongoDB from backtracking through every other, which grows with the
// address's length to the power of the number of *.
export function toSearchPattern(query) {
	const parts = String(query ?? "").toLowerCase().split("*").filter(Boolean).map(escapeRegex);
	if (parts.length < 2) return parts[0] ?? null;
	return `^${parts.map((part) => `(?>.*?${part})`).join("")}`;
}
