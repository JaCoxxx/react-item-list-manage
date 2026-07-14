<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import PageLayout from "@/components/PageLayout.vue";
import { loadTags } from "@/shared/data";
import { requestJson } from "@/shared/api";
import type { ApiResponse, TagSummary } from "@/shared/types";
import { confirmAction, navigateTo, showSuccess } from "@/shared/utils";

const search = ref("");
const tags = ref<TagSummary[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const editingTagName = ref("");
const formTagName = ref("");

async function loadData(showToast = false) {
	error.value = "";
	try {
		const response = await loadTags(search.value.trim());
		tags.value = response.data.list;
		if (showToast) {
			showSuccess("标签列表已刷新");
		}
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "加载标签失败";
	} finally {
		loading.value = false;
	}
}

function startEdit(tagName: string) {
	editingTagName.value = tagName;
	formTagName.value = tagName;
}

function resetForm() {
	editingTagName.value = "";
	formTagName.value = "";
}

async function submitTag() {
	const tagName = formTagName.value.trim();
	if (!tagName) {
		error.value = "请输入标签名称";
		return;
	}

	saving.value = true;
	error.value = "";
	try {
		if (editingTagName.value) {
			await requestJson<ApiResponse<{ tagName: string; updated: boolean }>>(
				`/api/tags/${encodeURIComponent(editingTagName.value)}`,
				{
					method: "PATCH",
					data: {
						newTagName: tagName,
					},
				},
			);
			showSuccess("标签已更新");
		} else {
			await requestJson<ApiResponse<{ tagName: string; created: boolean }>>("/api/tags", {
				method: "POST",
				data: {
					tagName,
				},
			});
			showSuccess("标签已创建");
		}

		resetForm();
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "保存标签失败";
	} finally {
		saving.value = false;
	}
}

async function removeTag(tagName: string) {
	const confirmed = await confirmAction(`确定删除标签“${tagName}”吗？`);
	if (!confirmed) {
		return;
	}

	try {
		await requestJson<ApiResponse<{ deleted: true }>>(`/api/tags/${encodeURIComponent(tagName)}`, {
			method: "DELETE",
		});
		showSuccess("标签已删除");
		if (editingTagName.value === tagName) {
			resetForm();
		}
		await loadData(false);
	} catch (requestError) {
		error.value = requestError instanceof Error ? requestError.message : "删除标签失败";
	}
}

onShow(() => {
	void loadData(false);
});
</script>

<template>
	<PageLayout title="标签维护" sub-title="维护标签目录，支持搜索、重命名和删除。">
		<template #actions>
			<button class="button-secondary" @click="navigateTo('/pages/overview/index')">功能导航</button>
			<button class="button-primary" @click="loadData(true)">刷新列表</button>
		</template>

		<uni-notice-bar v-if="error" :text="error" type="error" :speed="0" />

		<uni-card title="搜索标签">
			<view class="stack-sm">
				<uni-easyinput v-model="search" placeholder="输入标签名搜索" />
				<button class="button-secondary" @click="loadData(false)">执行搜索</button>
			</view>
		</uni-card>

		<uni-card :title="editingTagName ? '编辑标签' : '新增标签'">
			<view class="stack-sm">
				<uni-easyinput v-model="formTagName" placeholder="例如：冷冻、饮料、零食" />
				<view class="inline-actions">
					<button class="button-primary" :loading="saving" @click="submitTag">
						{{ editingTagName ? "保存修改" : "新增标签" }}
					</button>
					<button class="button-secondary" @click="resetForm">重置</button>
				</view>
			</view>
		</uni-card>

		<uni-card title="标签列表">
			<view v-if="loading" class="empty-state">加载中...</view>
			<view v-else-if="tags.length === 0" class="empty-state">暂无标签</view>
			<view v-else class="stack-sm">
				<view v-for="tag in tags" :key="tag.tagName" class="list-row">
					<view class="stack-sm">
						<text class="item-title">{{ tag.tagName }}</text>
						<text class="muted">关联物品：{{ tag.itemCount }}</text>
					</view>
					<view class="inline-actions">
						<button class="button-secondary" @click="startEdit(tag.tagName)">编辑</button>
						<button class="button-danger" @click="removeTag(tag.tagName)">删除</button>
					</view>
				</view>
			</view>
		</uni-card>
	</PageLayout>
</template>
