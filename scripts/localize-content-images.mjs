#!/usr/bin/env node
/**
 * 内容配图本地化（posts / moments）。
 *
 * 流程：
 * 1. 扫描 `src/content/posts/*.md` 与 `src/content/moments/*.md` 中的远程图片：
 *    - Markdown：`![alt](https://…)`（支持可选的 "title"）
 *    - HTML：`<img src="https://…">`（单/双引号）
 *    - 已是站内路径（`/…`、`./…`、`../…`）的一律跳过。
 * 2. 优先复用本地旧站 uploads 备份（按文件名 basename 索引），否则 HTTP 下载
 *    （浏览器 UA + 图片域名 Referer，单张 15s 超时）。
 * 3. 位图（jpg/jpeg/png/bmp/tiff）统一转 WebP：质量 82、最大宽度 1920、保持宽高比；
 *    gif / svg / webp 原样保留，不破坏动图与矢量。
 * 4. 归档：posts → `public/images/posts/<文章slug>/NN.webp`；
 *    moments → `public/images/moments/<说说slug>-NN.webp`。
 * 5. 改写 Markdown 引用为本地绝对路径；失败项写入 BROKEN_ASSETS 报告。
 *
 * 用法：
 *   node scripts/localize-content-images.mjs --dry       只统计，不写文件
 *   node scripts/localize-content-images.mjs             执行
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const CONTENT_DIRS = ["src/content/posts", "src/content/moments"];
const PUBLIC_REL = "public/images";
const BACKUP_ROOTS = [
  path.resolve(ROOT, "../private-backups"),
  path.resolve(ROOT, "../migration_staging"),
  path.resolve(ROOT, "../migration-input"),
];
const REPORT_FILE = path.resolve(ROOT, "../BROKEN_ASSETS.md");

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;
const WEBP_QUALITY = 82;
const MAX_WIDTH = 1920;

/** 保持原格式的扩展名（动图 / 矢量 / 已是 webp） */
const KEEP_EXT = new Set([".gif", ".svg", ".webp"]);
const IMAGE_EXT = new Set([
	".jpg",
	".jpeg",
	".png",
	".webp",
	".gif",
	".svg",
	".bmp",
	".tiff",
	".avif",
]);

const IMG_RE =
	/!\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+?)(?:\s+"[^"]*")?\s*\)|<img\b[^>]*?\bsrc\s*=\s*(["'])(https?:\/\/[\s\S]*?)\3/gi;

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const LIMIT = (() => {
	const hit = argv.find((a) => a.startsWith("--limit="));
	if (!hit) return Number.POSITIVE_INFINITY;
	const n = Number.parseInt(hit.split("=")[1], 10);
	return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
})();

const log = (...args) => console.log(...args);

function rel(p) {
	return path.relative(ROOT, p).split(path.sep).join("/");
}

function listMarkdownFiles() {
	const files = [];
	for (const dir of CONTENT_DIRS) {
		const abs = path.join(ROOT, dir);
		if (!fs.existsSync(abs)) continue;
		for (const name of fs.readdirSync(abs)) {
			if (name.endsWith(".md") || name.endsWith(".mdx")) {
				files.push({ abs: path.join(abs, name), kind: dir.includes("moments") ? "moments" : "posts", slug: path.basename(name, path.extname(name)) });
			}
		}
	}
	return files;
}

/** 递归索引备份目录里的图片文件名（小写 basename → 路径列表） */
function indexBackups() {
	const index = new Map();
	const walk = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
				continue;
			}
			const ext = path.extname(entry.name).toLowerCase();
			if (!IMAGE_EXT.has(ext)) continue;
			const key = entry.name.toLowerCase();
			const list = index.get(key) ?? [];
			list.push(full);
			index.set(key, list);
		}
	};
	for (const root of BACKUP_ROOTS) {
		if (fs.existsSync(root)) walk(root);
	}
	return index;
}

/** URL → 原始文件名（解码、去查询串） */
function urlBasename(rawUrl) {
	try {
		const u = new URL(rawUrl);
		const base = decodeURIComponent(path.posix.basename(u.pathname));
		return base || "";
	} catch {
		return "";
	}
}

function extOfName(name) {
	const ext = path.extname(name).toLowerCase();
	return IMAGE_EXT.has(ext) ? ext : "";
}

function refererFor(rawUrl) {
	try {
		const u = new URL(rawUrl);
		if (u.hostname.endsWith("fancivoid.asia")) return "https://www.fancivoid.asia/";
		return `${u.protocol}//${u.host}/`;
	} catch {
		return "https://www.fancivoid.asia/";
	}
}

function guessExtFromContentType(ct) {
	const value = (ct || "").toLowerCase();
	if (value.includes("png")) return ".png";
	if (value.includes("gif")) return ".gif";
	if (value.includes("svg")) return ".svg";
	if (value.includes("webp")) return ".webp";
	if (value.includes("avif")) return ".avif";
	return ".jpg";
}

/** 下载单张图片（浏览器 UA + 图片域名 Referer，15s 超时） */
async function fetchBinary(url) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			redirect: "follow",
			headers: {
				"User-Agent": UA,
				Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
				Referer: refererFor(url),
			},
		});
		if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length < 64) return { ok: false, reason: "响应过小（可能被拦截）" };
		return {
			ok: true,
			buffer,
			contentType: res.headers.get("content-type") ?? "",
		};
	} catch (error) {
		const reason =
			error?.name === "AbortError"
				? `超时 ${TIMEOUT_MS}ms`
				: String(error?.message ?? error);
		return { ok: false, reason };
	} finally {
		clearTimeout(timer);
	}
}

/** 位图转 WebP（q82 / 最宽 1920 / 保持比例）；gif·svg·webp 原样保留 */
async function prepareAsset(buffer, srcExt) {
	if (KEEP_EXT.has(srcExt)) return { buffer, ext: srcExt, converted: false };
	const meta = await sharp(buffer).metadata();
	let pipeline = sharp(buffer).rotate();
	if (meta.width && meta.width > MAX_WIDTH) {
		pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
	}
	const webp = await pipeline.webp({ quality: WEBP_QUALITY, effort: 5 }).toBuffer();
	return { buffer: webp, ext: ".webp", converted: true };
}

function pad(n) {
	return String(n).padStart(2, "0");
}

async function main() {
	const startedAt = new Date();
	const files = listMarkdownFiles();
	const backupIndex = indexBackups();

	const stats = {
		files: files.length,
		refs: 0,
		distinct: 0,
		localized: 0,
		fromBackup: 0,
		downloaded: 0,
		reused: 0,
		failed: 0,
		bytesBefore: 0,
		bytesAfter: 0,
	};
	const failures = [];
	const hostCounts = new Map();
	const seenUrls = new Set();
	/** url → 已落地的绝对路径（跨文章复用，避免重复下载） */
	const resolved = new Map();
	let budget = LIMIT;

	log(
		`扫描 ${files.length} 个 Markdown 文件；备份索引 ${backupIndex.size} 个文件名` +
			(DRY ? "（dry-run，不写文件）" : ""),
	);

	for (const file of files) {
		const content = await fsp.readFile(file.abs, "utf8");
		// 跳过 YAML frontmatter：description 等字段里可能出现 Markdown 图片文本，
		// 那是元数据而非正文配图，不参与本地化（索引按整文件偏移补偿）。
		const frontmatter = /^(?:\uFEFF)?---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(
			content,
		);
		const scanStart = frontmatter ? frontmatter[0].length : 0;
		const body = scanStart > 0 ? content.slice(scanStart) : content;
		const matches = [];
		IMG_RE.lastIndex = 0;
		let m;
		while ((m = IMG_RE.exec(body))) {
			const url = (m[4] ?? m[2] ?? "").trim();
			if (!url) continue;
			matches.push({
				url,
				matchStart: scanStart + m.index,
				matchText: m[0],
				alt: m[1] ?? "",
			});
		}
		if (matches.length === 0) continue;

		stats.refs += matches.length;

		const targetDirRel =
			file.kind === "posts"
				? path.posix.join(PUBLIC_REL, "posts", file.slug)
				: path.posix.join(PUBLIC_REL, "moments");
		/** 写入 Markdown 的站内路径（public/ 目录在站点根提供，需去掉 public 前缀） */
		const targetDirWeb = path.posix.join("/", path.posix.relative("public", targetDirRel));
		/** 本文件内 url → 本地公开路径 */
		const perFile = new Map();
		let counter = 0;

		for (const item of matches) {
			if (!seenUrls.has(item.url)) {
				seenUrls.add(item.url);
				let host = "?";
				try {
					host = new URL(item.url).hostname;
				} catch {}
				hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
			}
			if (perFile.has(item.url)) continue; // 同文件重复引用同一张图
			if (budget <= 0) {
				perFile.set(item.url, null);
				continue;
			}

			counter += 1;
			const baseName =
				file.kind === "posts" ? pad(counter) : `${file.slug}-${pad(counter)}`;

			// 1) 跨文章复用已解析结果：复制文件而非重复抓取
			const cachedAbs = resolved.get(item.url);
			if (cachedAbs) {
				const ext = path.extname(cachedAbs);
				const targetAbs = path.join(ROOT, targetDirRel, `${baseName}${ext}`);
				const publicPath = `${targetDirWeb}/${baseName}${ext}`;
				if (!DRY) {
					await fsp.mkdir(path.dirname(targetAbs), { recursive: true });
					await fsp.copyFile(cachedAbs, targetAbs);
				}
				perFile.set(item.url, publicPath);
				stats.reused += 1;
				stats.localized += 1;
				continue;
			}

			budget -= 1;
			await processOne(item.url, { file, baseName, targetDirRel, targetDirWeb, perFile, backupIndex, stats, failures, resolved });
		}

		// 2) 回写 Markdown：仅替换图片语法内部的 URL（保留 title 等其余文本）
		if (!DRY) {
			let next = content;
			for (let i = matches.length - 1; i >= 0; i -= 1) {
				const item = matches[i];
				const local = perFile.get(item.url);
				if (!local) continue;
				const offset = item.matchText.indexOf(item.url);
				if (offset < 0) continue;
				const start = item.matchStart + offset;
				const end = start + item.url.length;
				next = next.slice(0, start) + local + next.slice(end);
			}
			if (next !== content) await fsp.writeFile(file.abs, next, "utf8");
		}
	}

	stats.distinct = seenUrls.size;
	if (!DRY) await writeReport({ stats, failures, hostCounts, startedAt });
	printSummary(stats, failures, hostCounts);
}

/** 单张图片：本地备份优先 → HTTP 下载 → 转码 → 落盘 */
async function processOne(url, ctx) {
	const { file, baseName, targetDirRel, targetDirWeb, perFile, backupIndex, stats, failures, resolved } =
		ctx;
	const name = urlBasename(url);
	const backupCandidates = name
		? (backupIndex.get(name.toLowerCase()) ?? [])
		: [];
	let buffer = null;
	let srcExt = extOfName(name);
	let origin = "";

	// 1) 本地旧站 uploads 备份（按同名文件命中即直接复用）
	for (const candidate of backupCandidates) {
		try {
			buffer = await fsp.readFile(candidate);
			srcExt = extOfName(path.basename(candidate)) || srcExt;
			origin = "backup";
			break;
		} catch {}
	}

	// dry-run：不联网、不落盘，只统计「备份命中 / 需要下载」
	if (DRY) {
		const ext = srcExt || ".webp";
		perFile.set(url, `${targetDirWeb}/${baseName}${ext}`);
		if (buffer) {
			stats.fromBackup += 1;
			stats.bytesBefore += buffer.length;
		} else {
			stats.downloaded += 1;
			log(`  ?  ${rel(file.abs)} :: ${url} (需下载)`);
		}
		stats.localized += 1;
		return;
	}

	// 2) 否则走 HTTP
	if (!buffer) {
		const res = await fetchBinary(url);
		if (!res.ok) {
			stats.failed += 1;
			failures.push({
				url,
				file: rel(file.abs),
				slug: file.slug,
				reason: res.reason,
			});
			log(`  x  ${rel(file.abs)} :: ${url} (${res.reason})`);
			return;
		}
		buffer = res.buffer;
		if (!srcExt) srcExt = guessExtFromContentType(res.contentType);
		origin = "download";
	}

	// 3) 转码（位图→webp；gif/svg/webp 原样）
	let asset;
	try {
		asset = await prepareAsset(buffer, srcExt);
	} catch (error) {
		stats.failed += 1;
		failures.push({
			url,
			file: rel(file.abs),
			slug: file.slug,
			reason: `转码失败：${error?.message ?? error}`,
		});
		return;
	}

	const targetAbs = path.join(ROOT, targetDirRel, `${baseName}${asset.ext}`);
	const publicPath = `${targetDirWeb}/${baseName}${asset.ext}`;

	stats.bytesBefore += buffer.length;
	stats.bytesAfter += asset.buffer.length;
	if (origin === "download") stats.downloaded += 1;
	else stats.fromBackup += 1;
	stats.localized += 1;

	if (!DRY) {
		await fsp.mkdir(path.dirname(targetAbs), { recursive: true });
		await fsp.writeFile(targetAbs, asset.buffer);
	}
	resolved.set(url, targetAbs);
	perFile.set(url, publicPath);

	const kb = (n) => `${(n / 1024).toFixed(0)}KB`;
	log(
		`  ok ${rel(file.abs)} -> ${publicPath} [${origin === "backup" ? "备份" : "下载"} ${kb(buffer.length)} -> ${kb(asset.buffer.length)}]`,
	);
}

function formatBytes(bytes) {
	const abs = Math.abs(bytes);
	if (abs >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	if (abs >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${bytes} B`;
}

async function writeReport({ stats, failures, hostCounts, startedAt }) {
	const lines = [];
	lines.push("# 失效外链图片报告（BROKEN_ASSETS）", "");
	lines.push(
		`> 由 \`scripts/localize-content-images.mjs\` 于 ${startedAt.toISOString()} 生成。`,
	);
	lines.push(
		`> 扫描范围：\`src/content/posts/*.md\` 与 \`src/content/moments/*.md\` 中的 \`![…](https://…)\` 与 \`<img src=\\"https://…\\">\`。`,
		"",
	);
	lines.push("## 摘要", "");
	lines.push(`- 扫描文件：**${stats.files}** 个`);
	lines.push(`- 图片引用：**${stats.refs}** 次（去重后 **${stats.distinct}** 张）`);
	lines.push(
		`- 成功本地化：**${stats.localized}** 张（备份复用 ${stats.fromBackup} / HTTP 下载 ${stats.downloaded} / 跨文复用副本 ${stats.reused}）`,
	);
	lines.push(
		`- 体积：${formatBytes(stats.bytesBefore)} → ${formatBytes(stats.bytesAfter)}（节省 ${formatBytes(stats.bytesBefore - stats.bytesAfter)}）`,
	);
	lines.push(`- 仍失败：**${failures.length}** 张`, "");

	if (failures.length > 0) {
		lines.push("## 失败清单（需人工排查）", "");
		lines.push("| # | 所属文章 | 原 URL | 失败原因 |");
		lines.push("| --- | --- | --- | --- |");
		failures.forEach((item, i) => {
			lines.push(
				`| ${i + 1} | \`${path.basename(item.file)}\` | ${item.url.replace(/\|/g, "\\|")} | ${item.reason} |`,
			);
		});
		lines.push("");
	} else {
		lines.push("## 失败清单", "", "无 —— 全部图片已本地化。", "");
	}

	lines.push("## 图片域名分布", "");
	lines.push("| 域名 | 去重后的图片数 |");
	lines.push("| --- | --- |");
	for (const [host, count] of [...hostCounts.entries()].sort((a, b) => b[1] - a[1])) {
		lines.push(`| \`${host}\` | ${count} |`);
	}
	lines.push("");

	let previous = "";
	try {
		previous = await fsp.readFile(REPORT_FILE, "utf8");
	} catch {}
	const body = lines.join("\n");
	if (previous.trim()) {
		// 首次运行时把旧报告降级为历史存档；之后只保留最新一份（避免无限增长）
		const marker = "<!-- localize-content-images:archive -->";
		const archive = previous.includes(marker)
			? previous.slice(previous.indexOf(marker) + marker.length)
			: `\n## 历史存档（上一次的占位符扫描报告）\n\n${previous}`;
		await fsp.writeFile(
			REPORT_FILE,
			`${body}\n${marker}${archive}`,
			"utf8",
		);
	} else {
		await fsp.writeFile(REPORT_FILE, `${body}\n`, "utf8");
	}
	log(`\n报告已写入 ${REPORT_FILE}`);
}

function printSummary(stats, failures, hostCounts) {
	log("\n================ 汇总 ================");
	log(`Markdown 文件      : ${stats.files}`);
	log(`图片引用次数        : ${stats.refs}`);
	log(`去重图片数          : ${stats.distinct}`);
	log(`本地化成功          : ${stats.localized}`);
	log(`  来自本地备份      : ${stats.fromBackup}`);
	log(`  来自 HTTP 下载    : ${stats.downloaded}`);
	log(`  跨文章复用副本    : ${stats.reused}`);
	log(`体积                : ${formatBytes(stats.bytesBefore)} -> ${formatBytes(stats.bytesAfter)} (节省 ${formatBytes(stats.bytesBefore - stats.bytesAfter)})`);
	log(`失败                : ${failures.length}`);
	log("域名分布            :");
	for (const [host, count] of [...hostCounts.entries()].sort((a, b) => b[1] - a[1])) {
		log(`  ${host} : ${count}`);
	}
}

main().catch((error) => {
	console.error("[localize] 致命错误:", error);
	process.exit(1);
});
