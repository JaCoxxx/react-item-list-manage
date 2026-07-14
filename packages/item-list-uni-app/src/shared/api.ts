const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

type RequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

type RequestOptions = {
	method?: RequestMethod;
	data?: unknown;
	header?: Record<string, string>;
};

function resolveUrl(path: string) {
	if (/^https?:\/\//.test(path)) {
		return path;
	}

	return `${API_BASE_URL}${path}`;
}

function assertApiBaseUrl() {
	// #ifdef MP-WEIXIN
	if (!API_BASE_URL) {
		throw new Error(
			"小程序未配置后端地址，请在 packages/item-list-uni-app/.env 设置 VITE_API_BASE_URL 指向后端 https 域名。",
		);
	}
	// #endif
}

export function requestJson<T>(path: string, options: RequestOptions = {}) {
	return new Promise<T>((resolve, reject) => {
		assertApiBaseUrl();
		const method = options.method ?? "GET";
		const headers = {
			"content-type": "application/json",
			...(options.header ?? {}),
		};

		uni.request({
			url: resolveUrl(path),
			method,
			data: options.data,
			header: headers,
			success: (response) => {
				const payload = response.data as
					| { error?: string }
					| { data?: unknown }
					| string
					| null;

				// uniCloud URL 化 status 固定 200, 需看 body.error 判断错误 (兼容 Cloudflare 有 status)
				if (
					typeof payload === "object" &&
					payload !== null &&
					"error" in payload &&
					typeof payload.error === "string"
				) {
					reject(new Error(payload.error));
					return;
				}

				if (response.statusCode >= 200 && response.statusCode < 300) {
					resolve(payload as T);
					return;
				}

				reject(new Error(`Request failed with status ${response.statusCode}`));
			},
			fail: (error) => {
				reject(new Error(error.errMsg || "Network request failed"));
			},
		});
	});
}

export function uploadImage<T>(
	path: string,
	filePath: string,
	formData: Record<string, string> = {},
) {
	return new Promise<T>((resolve, reject) => {
		assertApiBaseUrl();
		uni.uploadFile({
			url: resolveUrl(path),
			filePath,
			name: "image",
			formData,
			success: (response) => {
				try {
					const payload = JSON.parse(response.data) as { error?: string };
					if (typeof payload.error === "string") {
						reject(new Error(payload.error));
						return;
					}
					if (response.statusCode >= 200 && response.statusCode < 300) {
						resolve(payload as T);
						return;
					}
					reject(new Error(`Upload failed with status ${response.statusCode}`));
				} catch {
					reject(new Error("Failed to parse upload response"));
				}
			},
			fail: (error) => {
				reject(new Error(error.errMsg || "Image upload failed"));
			},
		});
	});
}

export function chooseSingleImage() {
	return new Promise<string>((resolve, reject) => {
		uni.chooseImage({
			count: 1,
			sizeType: ["compressed"],
			sourceType: ["album", "camera"],
			success: (response) => {
				const filePath = response.tempFilePaths[0];
				if (!filePath) {
					reject(new Error("No image selected"));
					return;
				}
				resolve(filePath);
			},
			fail: (error) => {
				reject(new Error(error.errMsg || "Image selection cancelled"));
			},
		});
	});
}
