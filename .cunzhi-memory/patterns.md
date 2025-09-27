# 常用模式和最佳实践

- 在 augment-manager.html 实现了“赛博风”主题切换：
- 新增 Cyberpunk 主题（body.theme-cyber），通过 CSS 变量与特效覆盖实现，不改业务逻辑。
- 顶部导航加入 #nav-theme 按钮，点击在“简约”与“赛博风”之间切换，并动态更新按钮文案。
- 使用 localStorage 键 ui_theme 持久化主题（值：'default' 或 'cyber'），页面初始化时自动应用。
- 赛博风主题增强：在 body.theme-cyber 下新增动态特效，不改业务逻辑。
- 粒子网络 Canvas 背景（自适应尺寸、requestAnimationFrame、鼠标视差、可停用）
- 渐变视差（通过 CSS 变量 --g1x/--g1y/--g2x/--g2y）
- 霓虹脉冲动画（主头部与状态卡片）
- 按钮流光高光（hover 时流动高光带）
- 标题轻量故障动画（.glitch）
- 主题切换时自动 start/stop 效果并释放监听器
- 为每个账号凭证框添加详情按钮，弹出显示完整凭证信息（id/email/tenant/token/subToken），其中subToken需要加上https://portal.withorb.com/view?token=前缀并可点击跳转
- 为凭证卡片的余额和总额度添加动态炫酷进度条，在顶部统计区域添加总的可用量/总额度进度条（统计正常凭证），使用渐变色彩和动画效果，兼容赛博风主题
- 在youhou.js中为正常凭证区域添加了"检测"按钮：1.修改ui.section函数支持extraButton参数 2.在正常凭证区域标题旁添加检测按钮 3.添加事件绑定调用actions.batch(normalIds)检测所有正常凭证
- 在augment-manager.html中为正常凭证区域添加了"一键检测"按钮：1.修改generateCredentialSection函数为正常凭证(sectionId==='active')添加检测按钮 2.实现checkAllActiveCredentials函数专门检测所有ACTIVE状态的凭证 3.按钮显示为"🔄 一键检测"并调用相应函数
- 在youhou.js中添加了GitHub Gist云同步功能：1.添加gistSync对象包含配置管理、上传、下载、同步等功能 2.在UI中添加☁️云同步按钮 3.实现showSyncDialog配置界面和showCloudDataPreview预览界面 4.支持上传、下载、智能合并等完整云同步功能
- 修复youhou.js中GitHub Gist云同步功能的错误：1.修复upload和download方法的错误处理，添加详细的HTTP状态码判断 2.添加testConnection方法测试GitHub Token连接 3.在云同步对话框中添加🔗测试连接按钮 4.添加api.github.com到@connect权限列表
- 在augment-manager.html中移植youhou.js的圆环进度条样式：1.添加ringChartSVG函数生成圆环进度图 2.替换总体额度显示为圆环样式，包含总余额和状态统计 3.修复进度条百分比字体大小从11px改为14px 4.添加formatExpiryDate函数格式化到期时间，显示到分钟、周几和几天后
