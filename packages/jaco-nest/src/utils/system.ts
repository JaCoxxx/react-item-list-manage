let statusBarHeightCache: number | null = null

// 自定义导航栏（navigationStyle: custom）需要手动留出状态栏高度的安全区
export function getStatusBarHeight() {
  if (statusBarHeightCache === null)
    statusBarHeightCache = uni.getSystemInfoSync().statusBarHeight || 0
  return statusBarHeightCache
}
