// 云函数入口: uniCloud URL 化 event <-> Hono Request/Response 适配层
// event 字段以 uniCloud 阿里云 URL 化为准, 部署后实测微调

// ---------- Web API polyfill (Node 18 云函数环境) ----------
const { File } = require("node:buffer");
if (typeof globalThis.File === "undefined") {
	globalThis.File = File;
}
if (typeof String.prototype.toWellFormed !== "function") {
	String.prototype.toWellFormed = function toWellFormed() {
		return String(this);
	};
}
if (typeof String.prototype.isWellFormed !== "function") {
	String.prototype.isWellFormed = function isWellFormed() {
		return true;
	};
}

const { app } = require("./app.js");

// URL 化路径可能带前缀 (如 /http), 剥离到 /api
function normalizePath(rawPath) {
	const path = rawPath || "/";
	const idx = path.indexOf("/api");
	if (idx >= 0) return path.slice(idx);
	// URL 化可能去掉了 /api 前缀, 补回
	return "/api" + (path.startsWith("/") ? path : "/" + path);
}

exports.main = async (event) => {
	// uniCloud URL 化 event 结构: { args: { path, httpMethod, headers, queryStringParameters, body, isBase64Encoded }, requestId }
	const evt = event.args || event;
	const query = evt.queryStringParameters || {};
	const qs = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (v !== undefined && v !== null) {
			qs.set(k, String(v));
		}
	}
	const path = normalizePath(evt.path);
	const url = `https://unicloud.local${path}${qs.toString() ? "?" + qs : ""}`;

	const headers = evt.headers || {};
	const init = {
		method: evt.httpMethod || "GET",
		headers,
	};

	if (evt.body && init.method !== "GET" && init.method !== "HEAD") {
		init.body = evt.isBase64Encoded
			? Buffer.from(evt.body, "base64")
			: evt.body;
	}

	let request;
	try {
		request = new Request(url, init);
	} catch {
		return {
			statusCode: 400,
			headers: { "content-type": "application/json; charset=utf-8" },
			body: JSON.stringify({ error: "Invalid request." }),
		};
	}

	const response = await app.fetch(request);
	const body = await response.text();
	// uniCloud 阿里云 URL 化: return 值整体作为 HTTP body (不解析 statusCode/headers/body wrapper, status 固定 200)
	// 直接返回解析后的对象, uniCloud 会 JSON.stringify 并设 application/json
	// 前端据此看 body.error 判断错误 (见 shared/api.ts)
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
};
