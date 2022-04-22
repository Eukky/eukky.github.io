module.exports = {
    markdown: {
        lineNumbers: true,
        extendMarkdown: md => {
            md.set({html: true})
            md.use(require('markdown-it-texmath'), {"throwOnError" : false, "errorColor" : " #cc0000"})
        }
    },
    head: [
        ['link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.5.1/katex.min.css'}],
        ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/github-markdown-css/2.2.1/github-markdown.css'}],
    ],
    title: 'META TECH',
    description: '一个单纯的技术分享站点',
    base: '/',
    themeConfig: {
        lastUpdated: 'Last Updated',
        nextLinks: true,
        prevLinks: true,
        editLinks: true,
        editLinkText: '帮助我们改善此页面！',
        sidebarDepth: 2,
        nav: [
            { text: '主页', link: '/' },
            { 
                text: '游戏开发', 
                items: [
                    { text: 'Unity', link: '/GameDev/Unity/' },
                    { text: 'Unreal Engine', link: '/GameDev/UnrealEngine/' }
                ]
            },
            { 
                text: 'APP开发', 
                items: [
                    { text: 'IOS', link: '/AppDev/IOS/' },
                    { text: 'Android', link: '/AppDev/Android/' }
                ]
            },
            { 
                text: '其他站点', 
                items: [
                    { text: 'Discord', link: 'https://discord.gg/AVeHFqCc' },
                    { text: 'Github', link: 'https://github.com' }
                ]
            },
        ],
    }
}
