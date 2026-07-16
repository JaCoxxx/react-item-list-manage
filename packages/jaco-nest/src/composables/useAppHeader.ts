import type { HeaderAction, HeaderBackMode } from '@/types/header'

type LeftType = 'back' | 'home' | 'none'

type UseAppHeaderProps = {
  backMode: HeaderBackMode
  isListPage: boolean
  homePath: string
  actions: HeaderAction[]
}

// JnAppHeader 的行为逻辑：左侧按钮（返回/首页/无）的自动判定与导航。
export function useAppHeader(props: UseAppHeaderProps) {
  const statusBarHeight = getStatusBarHeight()

  function isHomePage() {
    const currentPage = getCurrentPages().at(-1)
    return currentPage?.route ? `/${currentPage.route}` === props.homePath : false
  }

  // auto: 有页面栈时返回；直接进入的非首页页面显示首页入口；首页不显示。
  const leftType = computed<LeftType>(() => {
    if (props.backMode === 'back')
      return 'back'
    if (props.backMode === 'home')
      return 'home'
    if (props.backMode === 'none')
      return 'none'
    if (getCurrentPages().length > 1)
      return 'back'

    return isHomePage() ? 'none' : 'home'
  })

  const actionList = computed(() => props.actions ?? [])

  function onBack() {
    if (getCurrentPages().length > 1)
      uni.navigateBack()
    else
      uni.reLaunch({ url: props.homePath })
  }

  function onHome() {
    uni.reLaunch({ url: props.homePath })
  }

  return {
    statusBarHeight,
    leftType,
    actionList,
    onBack,
    onHome,
  }
}
