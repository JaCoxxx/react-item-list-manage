import type { AiProvider, PageLayoutMode } from "./types";

const AI_PROVIDER_KEY = "item-list-uni-ai-provider";
const PAGE_LAYOUT_KEY = "item-list-uni-page-layout";

export function getAiProvider(): AiProvider {
	const value = uni.getStorageSync(AI_PROVIDER_KEY);
	return value === "deepseek" ? "deepseek" : "gpt";
}

export function setAiProvider(value: AiProvider) {
	uni.setStorageSync(AI_PROVIDER_KEY, value);
}

export function getPageLayoutMode(): PageLayoutMode {
	const value = uni.getStorageSync(PAGE_LAYOUT_KEY);
	if (value === "two-column" || value === "three-column" || value === "row") {
		return value;
	}
	return "row";
}

export function setPageLayoutMode(value: PageLayoutMode) {
	uni.setStorageSync(PAGE_LAYOUT_KEY, value);
}
