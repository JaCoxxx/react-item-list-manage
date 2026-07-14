<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";

onLaunch(() => {
	// 应用启动入口，可在此初始化全局逻辑
});
</script>

<style>
page {
	background: #f5f5f5;
	color: #111827;
	font-size: 28rpx;
}

view,
text,
button,
input,
textarea,
picker,
label,
scroll-view,
swiper,
swiper-item,
navigator {
	box-sizing: border-box;
}

.page-shell {
	padding: 24rpx;
}

.page-stack {
	display: flex;
	flex-direction: column;
	gap: 20rpx;
}

.page-header {
	display: flex;
	flex-direction: column;
	gap: 12rpx;
}

.page-title {
	font-size: 40rpx;
	font-weight: 700;
	color: #111827;
}

.page-subtitle {
	font-size: 24rpx;
	line-height: 1.6;
	color: #6b7280;
}

/* uni-popup 内容容器 */
.popup-sheet {
	width: 100%;
	max-width: 1080rpx;
	margin: 0 auto;
	max-height: 85vh;
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	display: flex;
	flex-direction: column;
}

.popup-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 16rpx;
	padding: 24rpx;
	border-bottom: 2rpx solid #f3f4f6;
}

.popup-title {
	font-size: 32rpx;
	font-weight: 700;
	color: #111827;
}

.popup-close {
	font-size: 36rpx;
	color: #9ca3af;
	padding: 0 8rpx;
	line-height: 1;
}

.popup-body {
	padding: 24rpx;
	max-height: 70vh;
}

.stack-sm {
	display: flex;
	flex-direction: column;
	gap: 12rpx;
}

.stack-md {
	display: flex;
	flex-direction: column;
	gap: 18rpx;
}

.stack-lg {
	display: flex;
	flex-direction: column;
	gap: 24rpx;
}

.row-wrap {
	display: flex;
	flex-wrap: wrap;
	gap: 12rpx;
}

.form-grid {
	display: grid;
	grid-template-columns: 1fr;
	gap: 16rpx;
}

.form-field {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
}

.field-label {
	font-size: 24rpx;
	font-weight: 600;
	color: #374151;
}

.field-hint {
	font-size: 22rpx;
	color: #6b7280;
}

.picker-display,
.select-display {
	width: 100%;
	border: 2rpx solid #e5e7eb;
	border-radius: 14rpx;
	background: #ffffff;
	padding: 18rpx 20rpx;
	font-size: 26rpx;
	color: #111827;
}

.picker-display.placeholder,
.select-display.placeholder {
	color: #9ca3af;
}

.button-primary,
.button-secondary,
.button-danger {
	border-radius: 14rpx;
	padding: 0 24rpx;
	font-size: 26rpx;
	line-height: 76rpx;
	height: 76rpx;
}

.button-primary {
	background: #111827;
	color: #ffffff;
}

.button-secondary {
	background: #f3f4f6;
	color: #111827;
}

.button-danger {
	background: #fee2e2;
	color: #b91c1c;
}

.stats-grid,
.menu-grid,
.item-grid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16rpx;
}

.stat-card,
.menu-card,
.item-card {
	background: #ffffff;
	border-radius: 18rpx;
	padding: 20rpx;
	border: 2rpx solid #f3f4f6;
}

.stat-value {
	font-size: 40rpx;
	font-weight: 700;
	color: #111827;
}

.stat-label {
	font-size: 24rpx;
	color: #6b7280;
	margin-top: 8rpx;
}

.menu-card {
	display: flex;
	flex-direction: column;
	gap: 8rpx;
}

.menu-title {
	font-size: 28rpx;
	font-weight: 700;
	color: #111827;
}

.menu-copy {
	font-size: 22rpx;
	line-height: 1.5;
	color: #6b7280;
}

.item-title {
	font-size: 28rpx;
	font-weight: 700;
	color: #111827;
}

.muted {
	font-size: 22rpx;
	color: #6b7280;
}

.mono {
	font-family: ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
		"Liberation Mono", "Courier New", monospace;
}

.divider {
	height: 2rpx;
	background: #f3f4f6;
}

.empty-state {
	padding: 32rpx 20rpx;
	text-align: center;
	color: #6b7280;
	font-size: 24rpx;
}

.tag-list {
	display: flex;
	flex-wrap: wrap;
	gap: 10rpx;
}

.inline-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 12rpx;
}

.full-width {
	width: 100%;
}

.list-row {
	display: flex;
	flex-direction: column;
	gap: 10rpx;
	padding: 18rpx 0;
	border-bottom: 2rpx solid #f3f4f6;
}

.list-row:last-child {
	border-bottom: none;
	padding-bottom: 0;
}

.two-col {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 12rpx;
}

@media (min-width: 768px) {
	.page-shell {
		max-width: 1080rpx;
		margin: 0 auto;
	}

	.form-grid.two,
	.item-grid.layout-two,
	.menu-grid {
		grid-template-columns: 1fr 1fr;
	}

	.form-grid.three,
	.item-grid.layout-three,
	.stats-grid {
		grid-template-columns: repeat(3, 1fr);
	}
}
</style>
