module.exports = {
    title: 'META TECH',
    description: '一个单纯的技术分享站点',
    base: '/',
    themeConfig: {
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
                    { text: 'IOS', link: '/GameDev/IOS/' },
                    { text: 'Android', link: '/GameDev/Android/' }
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
