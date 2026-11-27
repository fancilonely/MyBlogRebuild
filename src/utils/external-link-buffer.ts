/**
 * 外链跳转缓冲（`/go/`）运行时。
 *
 * 设计目标：替代老 WordPress 站的 `redirect.php`，但完全静态、零后端：
 * - `bindExternalLinkBuffer()`：document 捕获阶段点击委托，把站内外链改道到
 *   `/go/?url=<encodeURIComponent(href)>`。放在捕获阶段是为了抢在 Swup 的
 *   `link:click` 之前拦下（Swup 的监听在冒泡阶段），拦下后立即阻断传播。
 * - `initRedirectBufferPage()`：`/go/` 页面逻辑——解析并校验目标、域名高亮、
 *   3 秒倒计时自动跳转（可取消）、返回上一页。幂等，Swup 换页后可重复调用。
 *
 * 约定：
 * - 仅允许 `http://` / `https://`（拒绝 `javascript:` 等伪协议注入）；
 * - 站内链接（当前 hostname、`INTERNAL_HOSTNAMES`）不缓冲；
 * - 带 `data-no-redirect` 的链接直接放行（`/go/` 页面的「继续前往」按钮依赖它）。
 */

import { url } from "./url-utils.ts";

/** 站点自有域名：除当前 hostname 外一并放行，避免裸域 / www 互跳被强制缓冲 */
const INTERNAL_HOSTNAMES = new Set(["fancivoid.asia", "www.fancivoid.asia"]);
const BUFFER_PATH = "/go/";
/** 缓冲页自动跳转倒计时（毫秒） */
const AUTO_REDIRECT_MS = 3000;

type BufferWindow = Window & { __externalLinkBufferBound?: boolean };

function normalizeHostname(hostname: string): string {
	return hostname.trim().toLowerCase();
}

function isInternalHostname(hostname: string): boolean {
	const host = normalizeHostname(hostname);
	if (!host || host === normalizeHostname(window.location.hostname)) return true;
	return INTERNAL_HOSTNAMES.has(host);
}

/** 仅接受绝对 http(s) 地址；相对地址、伪协议返回 null */
function parseHttpUrl(raw: string | null | undefined): URL | null {
	const value = raw?.trim();
	if (!value || !/^https?:\/\//i.test(value)) return null;
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	return parsed;
}

/**
 * 返回需要走缓冲页的外链绝对地址；站内链接或非法地址返回 `null`。
 */
export function resolveBufferedHref(
	href: string | null | undefined,
): string | null {
	const parsed = parseHttpUrl(href);
	if (!parsed || isInternalHostname(parsed.hostname)) return null;
	return parsed.href;
}

/** 目标地址 → 缓冲页 URL（自动带 BASE_URL，兼容子路径部署） */
export function bufferUrlFor(targetHref: string): string {
	return `${url(BUFFER_PATH)}?url=${encodeURIComponent(targetHref)}`;
}

/**
 * 全局外链拦截（捕获阶段 + 幂等绑定，Swup 换页后无需重新绑定）。
 */
export function bindExternalLinkBuffer(): void {
	const scoped = window as BufferWindow;
	if (scoped.__externalLinkBufferBound) return;
	scoped.__externalLinkBufferBound = true;

	document.addEventListener(
		"click",
		(event) => {
			if (event.defaultPrevented || event.button !== 0) return;
			// 修饰键点击（新标签/新窗口/下载）交给浏览器原生行为
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
				return;
			}

			const clicked = event.target;
			if (!(clicked instanceof Element)) return;

			const anchor = clicked.closest("a[href]");
			if (!(anchor instanceof HTMLAnchorElement)) return;
			if (anchor.hasAttribute("download")) return;
			if (anchor.closest("[data-no-redirect]") !== null) return;

			const bufferedHref = resolveBufferedHref(anchor.getAttribute("href"));
			if (!bufferedHref) return;

			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			const bufferedUrl = bufferUrlFor(bufferedHref);
			if (anchor.target === "_blank") {
				window.open(bufferedUrl, "_blank", "noopener,noreferrer");
			} else {
				window.location.assign(bufferedUrl);
			}
		},
		true,
	);
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

/**
 * `/go/` 缓冲页初始化：解析 `?url=`、渲染目标地址、绑定按钮与倒计时。
 *
 * 幂等实现：根节点打 `data-buffer-page-bound` 标记，Swup 重复触发时不会重复计时。
 */
export function initRedirectBufferPage(): void {
	const root = byId("go-page");
	if (!root || root.dataset.bufferPageBound === "true") return;
	root.dataset.bufferPageBound = "true";

	const urlLine = byId("go-target-url");
	const schemeEl = byId("go-target-scheme");
	const hostEl = byId("go-target-host");
	const restEl = byId("go-target-rest");
	const errorEl = byId("go-error");
	const countdownEl = byId("go-countdown");
	const hintEl = byId("go-hint");
	const continueLink = byId<HTMLAnchorElement>("go-continue");
	const cancelButton = byId<HTMLButtonElement>("go-cancel");
	const backButton = byId<HTMLButtonElement>("go-back");

	const raw = new URLSearchParams(window.location.search).get("url");
	const target = parseHttpUrl(raw);

	let timer = 0;

	const stopCountdown = (cancelled: boolean) => {
		window.clearTimeout(timer);
		timer = 0;
		if (countdownEl) countdownEl.hidden = true;
		if (cancelButton) cancelButton.hidden = true;
		if (cancelled && hintEl) {
			hintEl.textContent = "已取消自动跳转，可点击「继续前往」手动打开目标网站。";
		}
	};

	// 无效 / 缺失目标：只保留「返回上一页」，不提供任何可跳转出口
	if (!target) {
		if (errorEl) {
			errorEl.hidden = false;
			errorEl.textContent = raw
				? "目标地址无效：仅支持 http:// 与 https:// 开头的链接，已阻止跳转。"
				: "缺少目标地址参数：请从站内链接重新进入本页。";
		}
		if (urlLine) urlLine.textContent = "—";
		if (continueLink) continueLink.hidden = true;
		if (hintEl) {
			hintEl.textContent = "本页为外链安全缓冲，不会记录你的跳转信息。";
		}
	} else {
		// 域名单独高亮，方便访客核对是否被钓鱼域名仿冒
		if (schemeEl) schemeEl.textContent = `${target.protocol}//`;
		if (hostEl) hostEl.textContent = target.host;
		if (restEl) {
			restEl.textContent = `${target.pathname}${target.search}${target.hash}`;
		}
		if (urlLine) urlLine.title = target.href;
		if (continueLink) {
			continueLink.href = target.href;
			continueLink.hidden = false;
		}

		let remaining = Math.ceil(AUTO_REDIRECT_MS / 1000);
		const renderCountdown = () => {
			if (countdownEl) {
				countdownEl.textContent = `将在 ${remaining} 秒后自动前往目标网站…`;
			}
		};
		const tick = () => {
			remaining -= 1;
			if (remaining <= 0) {
				stopCountdown(false);
				window.location.href = target.href;
				return;
			}
			renderCountdown();
			timer = window.setTimeout(tick, 1000);
		};

		if (countdownEl) countdownEl.hidden = false;
		renderCountdown();
		if (cancelButton) {
			cancelButton.hidden = false;
			cancelButton.addEventListener("click", () => stopCountdown(true), {
				once: true,
			});
		}
		timer = window.setTimeout(tick, 1000);
	}

	if (backButton) {
		backButton.addEventListener("click", () => {
			stopCountdown(true);
			let sameOriginReferrer = false;
			try {
				sameOriginReferrer =
					document.referrer !== "" &&
					new URL(document.referrer).origin === window.location.origin;
			} catch {
				sameOriginReferrer = false;
			}
			if (sameOriginReferrer && window.history.length > 1) {
				window.history.back();
			} else {
				window.location.assign(url("/"));
			}
		});
	}
}
