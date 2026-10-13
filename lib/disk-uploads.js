import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { slugify } from "./slug.js";

const MAX_ATTEMPTS = 3;

// Like Vercel Blob's addRandomSuffix: "images/team-photo.png" → "images/team-photo-<random>.png". Only
// a slug and a short extension survive, so no name can leave the images folder.
export function buildUploadName(pathname) {
	const base = path.posix.basename(String(pathname ?? ""));
	const dot = base.lastIndexOf(".");
	const extension = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
	const name = slugify(dot > 0 ? base.slice(0, dot) : base, 60) || "image";
	const suffix = crypto.randomBytes(12).toString("base64url").replace(/[-_]/g, "x");
	return `images/${name}-${suffix}${/^[a-z0-9]{1,5}$/.test(extension) ? `.${extension}` : ""}`;
}

// "wx" fails instead of replacing a file, so a sent email's picture never changes under it.
export async function putImageOnDisk({ directory, publicUrl, pathname, bytes }) {
	for (let attempt = 1; ; attempt += 1) {
		const name = buildUploadName(pathname);
		const file = path.join(directory, name);
		await mkdir(path.dirname(file), { recursive: true });
		try {
			await writeFile(file, bytes, { flag: "wx" });
			return `${publicUrl.replace(/\/+$/, "")}/${name}`;
		} catch (error) {
			if (error?.code !== "EEXIST" || attempt === MAX_ATTEMPTS) throw error;
		}
	}
}
