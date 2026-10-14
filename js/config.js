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
     proxyEndpoint : 同源代理接口，由随附的 server.py 提供
                     （推荐，可规避浏览器 CORS 限制并隐藏 API Key）
     directEndpoint: DeepSeek 官方接口，浏览器直连模式使用
     endpoint      : 实际请求地址，留空则自动探测（先 proxy，失败回落 direct）
     model         : deepseek-chat / deepseek-reasoner                          */
  ai: {
    proxyEndpoint: '/api/chat',
    healthEndpoint: '/api/health',
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
