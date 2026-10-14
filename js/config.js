/* ==========================================================================
   config.js — 站点集中配置
   修改此文件即可完成全站个性化，无需改动其它代码。
   ========================================================================== */

window.BLOG_CONFIG = {
  /* ---------- 站点信息 ---------- */
  siteName: 'Ink & Logic',
  siteDesc: '关于前端工程、AI 应用与写作的长期笔记',
  author: '站长',
  footerText: '用心记录，慢慢生长',
  icp: '',                      // 如需备案号，填入后会自动展示

  /* ---------- 文章存储 ---------- */
  postsDir: 'posts/',           // Markdown 文件目录（相对于站点根路径）
  manifest: 'posts/manifest.json',

  /* ---------- Twikoo 评论系统 ----------
     1) 前往 https://twikoo.js.org/ 部署后端（腾讯云 / Vercel / Docker 均可）
     2) 将控制台输出的 envId 填入下方
     envId 为空时，评论区会显示配置引导，不影响页面其它功能。          */
  twikoo: {
    version: '1.6.39',
    envId: '',                  // 例：'https://twikoo.example.com' 或 Vercel 环境 ID
    lang: 'zh-CN'
  },

  /* ---------- DeepSeek AI 问答 ----------
     前端有两种工作模式，页面加载时自动探测：

     [1] 代理模式（推荐，生产环境使用）
         把请求发到你自己的服务端，由服务端注入密钥并流式转发。
         这样既不受浏览器 CORS 限制，也不会把 API Key 暴露给访客。
         · 本地开发：保持 proxyEndpoint = '/api/chat'（由 server.py 提供）
         · 线上部署：填完整的代理地址，例如
           proxyEndpoint: 'https://your-worker.workers.dev/api/chat'
           健康检查地址会自动由 /chat 推导为 /health。
         参见 deploy/cloudflare-worker.js（一键部署的免费代理）。

     [2] 直连模式（仅在探测不到代理时回落）
         浏览器直接请求 DeepSeek 官方接口，密钥保存在访客本机。
         适合本地实验；公开部署意味着每位访客都要自己填 Key。

     字段说明
       proxyEndpoint : 代理接口地址（同源相对路径或完整 URL）
       directEndpoint: DeepSeek 官方接口
       endpoint      : 手动强制指定请求地址，留空则按模式自动选择
       model         : deepseek-chat / deepseek-reasoner                     */
  ai: {
    proxyEndpoint: '/api/chat',
    directEndpoint: 'https://api.deepseek.com/chat/completions',
    endpoint: '',
    model: 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt:
      '你是一位严谨、耐心的技术博客助手。回答需准确、结构清晰，' +
      '适当使用 Markdown 标题、列表与代码块。若问题超出给定文章范围，' +
      '请明确指出并给出你的补充判断。不要编造不存在的事实。',
    storageKey: 'blog.ai.settings.v1'
  },

  /* ---------- 阅读体验 ---------- */
  charPerMinute: 380           // 中文阅读速度，用于估算阅读时长
};
