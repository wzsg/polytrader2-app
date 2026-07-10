import type { AppLocale } from '@polytrader/shared';

const HAN_RE = /\p{Script=Han}/u;
const TRANSLATABLE_ATTRS = ['title', 'aria-label', 'placeholder'] as const;

interface TranslationTerm {
  zh: string;
  en: string;
}

const exactTerms: Record<string, TranslationTerm> = {
  'app.eventBrowser': { zh: 'Polytrader2 事件浏览器', en: 'Polytrader2 Event Browser' },
  'app.tradingWindow': { zh: 'Polytrader2 交易窗口', en: 'Polytrader2 Trading Window' },
  'app.webBrowser': { zh: 'Polytrader2 网页浏览器', en: 'Polytrader2 Web Browser' },
  'app.tradingWindowShort': { zh: '交易窗口', en: 'Trading Window' },
  'nav.browse': { zh: '浏览', en: 'Browse' },
  'nav.trading': { zh: '交易', en: 'Trading' },
  'nav.system': { zh: '系统', en: 'System' },
  'nav.settings': { zh: '系统设置', en: 'Settings' },
  'nav.watchlist': { zh: '自选列表', en: 'Watchlist' },
  'nav.events': { zh: '事件列表', en: 'Events' },
  'nav.crypto': { zh: '加密货币', en: 'Crypto' },
  'nav.sports': { zh: '体育', en: 'Sports' },
  'nav.esports': { zh: '电竞', en: 'Esports' },
  'nav.orders': { zh: '订单列表', en: 'Orders' },
  'nav.trades': { zh: '成交列表', en: 'Trades' },
  'nav.positions': { zh: '持仓列表', en: 'Positions' },
  'tabs.openOrders': { zh: '当前订单', en: 'Open Orders' },
  'tabs.currentPositions': { zh: '当前持仓', en: 'Current Positions' },
  'tabs.tradeHistory': { zh: '成交记录', en: 'Trade History' },
  'tabs.strategyLogs': { zh: '策略日志', en: 'Strategy Logs' },
  'tabs.strategyHistory': { zh: '策略历史', en: 'Strategy History' },
  'tabs.market': { zh: '市场行情', en: 'Market' },
  'tabs.trades': { zh: '逐笔成交', en: 'Trades' },
  'tabs.tradeAnalysis': { zh: '成交分析', en: 'Trade Analysis' },
  'tabs.topHolders': { zh: 'Top 持有者', en: 'Top Holders' },
  'tabs.manualTrading': { zh: '手动交易', en: 'Manual Trading' },
  'tabs.autoTrading': { zh: '自动交易', en: 'Auto Trading' },
  'status.live': { zh: '实时', en: 'Live' },
  'status.liveUpdates': { zh: '实时更新', en: 'Live Updates' },
  'status.connecting': { zh: '连接中', en: 'Connecting' },
  'status.connectionFailed': { zh: '连接失败', en: 'Connection Failed' },
  'status.disconnected': { zh: '已断开', en: 'Disconnected' },
  'status.notConnected': { zh: '未连接', en: 'Disconnected' },
  'status.connected': { zh: '已连接', en: 'Connected' },
  'status.active': { zh: '进行中', en: 'Active' },
  'status.closed': { zh: '已关闭', en: 'Closed' },
  'status.inactive': { zh: '未激活', en: 'Inactive' },
  'status.notStarted': { zh: '未开始', en: 'Not Started' },
  'common.back': { zh: '后退', en: 'Back' },
  'common.forward': { zh: '前进', en: 'Forward' },
  'common.stop': { zh: '停止', en: 'Stop' },
  'common.refresh': { zh: '刷新', en: 'Refresh' },
  'common.close': { zh: '关闭', en: 'Close' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.allow': { zh: '允许', en: 'Allow' },
  'common.reject': { zh: '拒绝', en: 'Reject' },
  'common.save': { zh: '保存', en: 'Save' },
  'common.delete': { zh: '删除', en: 'Delete' },
  'common.edit': { zh: '编辑', en: 'Edit' },
  'common.retry': { zh: '重试', en: 'Retry' },
  'common.reset': { zh: '重置', en: 'Reset' },
  'common.filter': { zh: '筛选', en: 'Filter' },
  'common.filtering': { zh: '筛选中', en: 'Filtering' },
  'common.search': { zh: '搜索', en: 'Search' },
  'common.all': { zh: '全部', en: 'All' },
  'common.custom': { zh: '自定义', en: 'Custom' },
  'common.previous': { zh: '上一页', en: 'Previous' },
  'common.next': { zh: '下一页', en: 'Next' },
  'common.yes': { zh: '是', en: 'Yes' },
  'common.no': { zh: '否', en: 'No' },
  'common.ended': { zh: '已结束', en: 'Ended' },
  'common.option': { zh: '选项', en: 'Option' },
  'common.loading': { zh: '加载中', en: 'Loading' },
  'common.loadFailed': { zh: '加载失败', en: 'Failed to load' },
  'common.requestFailed': { zh: '请求失败', en: 'Request failed' },
  'common.accountLoadFailed': { zh: '钱包加载失败', en: 'Failed to load wallets' },
  'common.default': { zh: '默认', en: 'Default' },
  'common.defaultAccount': { zh: '默认帐户', en: 'Default' },
  'common.minutes': { zh: '分钟', en: 'minutes' },
  'table.status': { zh: '状态', en: 'Status' },
  'table.title': { zh: '标题', en: 'Title' },
  'table.price': { zh: '价格', en: 'Price' },
  'table.size': { zh: '数量', en: 'Size' },
  'table.shares': { zh: '份额', en: 'Shares' },
  'table.amount': { zh: '金额', en: 'Amount' },
  'table.amountPusd': { zh: '金额pUSD', en: 'Amount pUSD' },
  'table.estimatedCost': { zh: '预估占用', en: 'Estimated Cost' },
  'table.side': { zh: '方向', en: 'Side' },
  'table.source': { zh: '来源', en: 'Source' },
  'table.time': { zh: '时间', en: 'Time' },
  'table.role': { zh: '角色', en: 'Role' },
  'table.module': { zh: '模块', en: 'Module' },
  'table.message': { zh: '消息', en: 'Message' },
  'table.level': { zh: '级别', en: 'Level' },
  'table.strategy': { zh: '策略', en: 'Strategy' },
  'table.version': { zh: '版本', en: 'Version' },
  'table.user': { zh: '用户', en: 'User' },
  'table.position': { zh: '持仓量', en: 'Position' },
  'table.avgPrice': { zh: '均价', en: 'Avg Price' },
  'table.currentPrice': { zh: '现价', en: 'Current Price' },
  'table.pnl': { zh: '盈亏', en: 'P/L' },
  'table.marketValue': { zh: '市值', en: 'Market Value' },
  'account.name': { zh: '钱包名称', en: 'Wallet Name' },
  'account.PolymarketWallet': { zh: '交易钱包', en: 'Trading Wallet' },
  'account.balance': { zh: '余额', en: 'Balance' },
  'account.noTradableWallets': { zh: '无可交易钱包', en: 'No tradable wallets' },
  'account.walletOnly': { zh: '仅钱包', en: 'Wallet Only' },
  'settings.autoSync': { zh: '自动同步', en: 'Auto Sync' },
  'settings.syncInterval': { zh: '同步间隔', en: 'Sync Interval' },
  'settings.scheduledSync': { zh: '定时同步', en: 'Scheduled Sync' },
  'settings.dataSync': { zh: '数据同步', en: 'Data Sync' },
  'settings.localCache': { zh: '本地缓存', en: 'Local Cache' },
  'settings.cacheAndSync': { zh: '本地缓存与数据同步', en: 'Local Cache and Data Sync' },
  'settings.eventData': { zh: '事件数据', en: 'Event Data' },
  'settings.marketData': { zh: '市场数据', en: 'Market Data' },
  'settings.lastSyncTime': { zh: '最后同步时间', en: 'Last Sync Time' },
  'settings.fromPolymarketApi': { zh: '来自 R2 事件快照', en: 'From R2 event snapshot' },
  'settings.from': { zh: '来自', en: 'From' },
  'settings.startSync': { zh: '开始同步', en: 'Start Sync' },
  'settings.notSyncedYet': { zh: '尚未同步', en: 'Not synced yet' },
  'loading.syncData': { zh: '同步数据', en: 'Sync data' },
  'loading.saveSchedule': { zh: '保存同步计划', en: 'Save sync schedule' },
  'loading.eventStats': { zh: '加载事件数据统计', en: 'Load event data stats' },
  'loading.marketStats': { zh: '加载市场数据统计', en: 'Load market data stats' },
  'loading.filters': { zh: '加载筛选配置', en: 'Load filter configuration' },
  'loading.market': { zh: '加载市场', en: 'Load market' },
  'loading.eventMarkets': { zh: '加载事件市场', en: 'Load event markets' },
  'loading.marketList': { zh: '加载市场列表', en: 'Load market list' },
  'loading.tradeAnalysis': { zh: '加载成交分析', en: 'Load trade analysis' },
  'loading.tradeHistory': { zh: '加载成交记录', en: 'Load trade history' },
  'loading.trades': { zh: '加载逐笔成交', en: 'Load trades' },
  'loading.moreTrades': { zh: '加载更多逐笔成交', en: 'Load more trades' },
  'loading.currentPositions': { zh: '加载当前持仓', en: 'Load current positions' },
  'loading.chart': { zh: '加载走势中', en: 'Loading chart' },
  'loading.strategyLogs': { zh: '加载策略日志', en: 'Load strategy logs' },
  'loading.strategyHistory': { zh: '加载策略历史', en: 'Load strategy history' },
  'market.eventMarkets': { zh: '事件市场', en: 'Event Markets' },
  'market.eventRules': { zh: '事件规则', en: 'Event Rules' },
  'market.untitled': { zh: '未命名市场', en: 'Untitled Market' },
  'market.bestBid': { zh: '买一', en: 'Best Bid' },
  'market.bestAsk': { zh: '卖一', en: 'Best Ask' },
  'market.bids': { zh: '买盘Bids', en: 'Bids' },
  'market.asks': { zh: '卖盘Asks', en: 'Asks' },
  'market.spread': { zh: '点差', en: 'Spread' },
  'market.lastTrade': { zh: '最近成交', en: 'Last Trade' },
  'market.minOrder': { zh: '最小下单', en: 'Minimum Order' },
  'market.volume': { zh: '成交量', en: 'Volume' },
  'market.turnover': { zh: '成交额', en: 'Turnover' },
  'market.totalVolume': { zh: '总成交量', en: 'Total Volume' },
  'market.volume24h': { zh: '24h 成交量', en: '24h Volume' },
  'market.liquidity': { zh: '流动性', en: 'Liquidity' },
  'market.depth': { zh: '深度', en: 'Depth' },
  'market.marketCount': { zh: '市场数', en: 'Markets' },
  'market.chart': { zh: '价格走势', en: 'Price Chart' },
  'market.series': { zh: '走势', en: 'series' },
  'market.points': { zh: '点', en: 'points' },
  'trade.buy': { zh: '买入', en: 'Buy' },
  'trade.sell': { zh: '卖出', en: 'Sell' },
  'trade.limit': { zh: '限价', en: 'Limit' },
  'trade.market': { zh: '市价', en: 'Market' },
  'trade.submitOrder': { zh: '提交订单', en: 'Submit Order' },
  'trade.cancelOrder': { zh: '撤单', en: 'Cancel' },
  'trade.manual': { zh: '手动', en: 'Manual' },
  'analysis.buyVolume': { zh: '买入量', en: 'Buy Volume' },
  'analysis.sellVolume': { zh: '卖出量', en: 'Sell Volume' },
  'analysis.tradeCount': { zh: '成交笔数', en: 'Trades' },
  'analysis.tradedShares': { zh: '成交份额', en: 'Shares Traded' },
  'analysis.lastPrice': { zh: '最新价', en: 'Last Price' },
  'analysis.high': { zh: '最高', en: 'High' },
  'analysis.low': { zh: '最低', en: 'Low' },
  'analysis.buySellDifference': { zh: '买卖量差', en: 'Buy/Sell Difference' },
  'analysis.buySellPressure': { zh: '买卖压力', en: 'Buy/Sell Pressure' },
  'analysis.pressure': { zh: '压力', en: 'Pressure' },
  'analysis.outcomeDistribution': { zh: 'Outcome 分布', en: 'Outcome Distribution' },
  'analysis.sideDistribution': { zh: '方向分布', en: 'Side Distribution' },
  'analysis.largeTrades': { zh: '大单', en: 'Large Trades' },
  'analysis.sortedByShares': { zh: '按份额排序', en: 'Sorted by shares' },
  'analysis.aggregationInterval': { zh: '成交量聚合粒度', en: 'Volume aggregation interval' },
  'analysis.startTime': { zh: '开始时间', en: 'Start Time' },
  'analysis.endTime': { zh: '结束时间', en: 'End Time' },
  'analysis.resetFilters': { zh: '重置分析筛选', en: 'Reset analysis filters' },
  'strategy.latestVersion': { zh: '最新版本', en: 'Latest Version' },
  'strategy.configJson': { zh: '配置JSON', en: 'Config JSON' },
  'strategy.start': { zh: '启动策略', en: 'Start Strategy' },
  'strategy.stopAndCancel': { zh: '停止并撤销挂单', en: 'Stop and Cancel Orders' },
  'strategy.run': { zh: '策略运行', en: 'Strategy Run' },
  'strategy.noActiveRun': {
    zh: '当前市场未运行策略',
    en: 'No strategy is running on this market',
  },
  'strategy.started': { zh: '启动', en: 'Started' },
  'strategy.runHistory': { zh: '运行历史', en: 'Run History' },
  'strategy.runDetails': { zh: '运行详情', en: 'Run Details' },
  'strategy.logs': { zh: '日志', en: 'Logs' },
  'strategy.orders': { zh: '策略订单', en: 'Strategy Orders' },
  'strategy.noOrderId': { zh: '无订单ID', en: 'No Order ID' },
  'strategy.stopFailed': { zh: '停止策略失败', en: 'Failed to stop strategy' },
  'empty.eventRules': { zh: '暂无事件规则', en: 'No event rules' },
  'empty.activeMarkets': { zh: '暂无活跃的市场', en: 'No active markets' },
  'empty.availableWallets': { zh: '暂无可用钱包', en: 'No available wallets' },
  'empty.orderBook': { zh: '暂无订单簿', en: 'No order book' },
  'empty.bids': { zh: '暂无买盘', en: 'No bids' },
  'empty.asks': { zh: '暂无卖盘', en: 'No asks' },
  'empty.trades': { zh: '暂无成交', en: 'No trades' },
  'empty.tradeRecords': { zh: '暂无成交记录', en: 'No trade records' },
  'empty.orders': { zh: '暂无订单', en: 'No orders' },
  'empty.positions': { zh: '暂无持仓', en: 'No positions' },
  'empty.strategies': { zh: '暂无策略', en: 'No strategies' },
  'empty.strategyLogs': { zh: '暂无策略日志', en: 'No strategy logs' },
  'empty.strategyHistory': { zh: '暂无策略历史', en: 'No strategy history' },
  'empty.holders': { zh: '暂无持有者数据', en: 'No holder data' },
  'empty.versions': { zh: '暂无版本', en: 'No versions' },
  'empty.logs': { zh: '暂无日志', en: 'No logs' },
  'empty.strategyOrders': { zh: '暂无策略订单', en: 'No strategy orders' },
  'empty.runHistory': { zh: '暂无运行历史', en: 'No run history' },
  'empty.outcome': { zh: '暂无outcome', en: 'No outcome' },
  'empty.priceChart': { zh: '暂无价格走势', en: 'No price chart' },
  'empty.accounts': { zh: '暂无钱包', en: 'No wallets' },
  'empty.data': { zh: '暂无数据', en: 'No data' },
  'chart.fromTrades': { zh: '使用逐笔成交绘制', en: 'Charted from trades' },
  'holders.tokenHolders': { zh: 'Token持有者', en: 'Token Holders' },
  'holders.dataSource': {
    zh: '数据来自DataAPI每outcome最多20条',
    en: 'Data from Data API, up to 20 rows per outcome',
  },
  'panels.expandActivity': { zh: '展开活动面板', en: 'Expand activity panel' },
  'panels.collapseActivity': { zh: '收起活动面板', en: 'Collapse activity panel' },
  'panels.resizeActivity': {
    zh: '拖动调整活动面板高度',
    en: 'Drag to resize activity panel height',
  },
  'panels.expandMarket': { zh: '展开市场面板', en: 'Expand market panel' },
  'panels.collapseMarket': { zh: '收起市场面板', en: 'Collapse market panel' },
  'panels.resizeCurrentMarket': {
    zh: '拖动调整当前市场面板宽度',
    en: 'Drag to resize current market panel width',
  },
  'panels.expandTrading': { zh: '展开交易面板', en: 'Expand trading panel' },
  'panels.collapseTrading': { zh: '收起交易面板', en: 'Collapse trading panel' },
  'panels.resizeOrder': { zh: '拖动调整下单面板宽度', en: 'Drag to resize order panel width' },
  'panels.resizeEventMarkets': {
    zh: '拖动调整事件市场面板宽度',
    en: 'Drag to resize event market panel width',
  },
  'filters.collapse': { zh: '收起筛选', en: 'Collapse filters' },
  'filters.expand': { zh: '展开筛选', en: 'Expand filters' },
  'filters.expandActive': {
    zh: '展开筛选当前有筛选条件',
    en: 'Expand filters, filters are active',
  },
  'filters.reset': { zh: '重置筛选', en: 'Reset filters' },
  'watchlist.label': { zh: '自选', en: 'Watchlist' },
  'watchlist.remove': { zh: '移出自选', en: 'Remove from watchlist' },
  'watchlist.add': { zh: '加入自选', en: 'Add to watchlist' },
  'crypto.coin': { zh: '币种', en: 'Coin' },
  'crypto.marketMode': { zh: '市场模式', en: 'Market Mode' },
  'crypto.timeframe': { zh: '时间框架', en: 'Timeframe' },
  'sports.sport': { zh: '项目', en: 'Sport' },
  'sports.sportLabel': { zh: '体育项目', en: 'Sport' },
  'sports.discipline': { zh: '门类', en: 'Discipline' },
  'sports.league': { zh: '联赛', en: 'League' },
  'sports.allSports': { zh: '全部体育', en: 'All Sports' },
  'sports.allLeagues': { zh: '全部联赛', en: 'All Leagues' },
  'sports.allEsports': { zh: '全部电竞', en: 'All Esports' },
  'sports.loadMetadata': { zh: '加载体育元数据', en: 'Load sports metadata' },
  'sports.loadMetadataFailed': {
    zh: '加载体育元数据失败：{error}',
    en: 'Failed to load sports metadata: {error}',
  },
  'sports.loadEventsFailed': {
    zh: '加载体育事件失败：{error}',
    en: 'Failed to load sports events: {error}',
  },
  'date.end': { zh: '结束日期', en: 'End Date' },
  'date.start': { zh: '开始日期', en: 'Start Date' },
  'stats.total': { zh: '总计', en: 'Total' },
  'stats.watchlistTotal': { zh: '自选总数', en: 'Watchlist Total' },
  'stats.filtered': { zh: '筛选后', en: 'Filtered' },
  'stats.filteredWatchlist': { zh: '筛选后自选', en: 'Filtered Watchlist' },
  'window.pin': { zh: '置顶窗口', en: 'Pin window' },
  'window.unpin': { zh: '取消置顶', en: 'Unpin window' },
  'window.minimize': { zh: '最小化', en: 'Minimize' },
  'window.maximize': { zh: '最大化', en: 'Maximize' },
  'window.restore': { zh: '还原', en: 'Restore' },
  'dialog.confirmMainClose': { zh: '确认关闭主窗口', en: 'Confirm Close' },
  'wallet.connection': { zh: '钱包连接', en: 'Wallet Connection' },
  'wallet.notConnected': {
    zh: '当前网站未连接钱包',
    en: 'The current site is not connected to a wallet',
  },
  'wallet.connected': { zh: '当前网站已连接', en: 'Current site connected' },
  'wallet.connectedWallets': { zh: '已连接钱包', en: 'Connected Wallets' },
  'wallet.disconnect': { zh: '断开连接', en: 'Disconnect' },
  'wallet.method': { zh: '方法', en: 'Method' },
  'wallet.content': { zh: '内容', en: 'Content' },
  'wallet.signatureConfirmation': { zh: '签名确认', en: 'Signature Confirmation' },
  'wallet.connect': { zh: '连接钱包', en: 'Connect Wallet' },
  'browser.pageLoadFailed': { zh: '页面加载失败', en: 'Page failed to load' },
  'browser.notInitialized': { zh: '浏览器页面尚未初始化', en: 'Browser page is not initialized' },
  'browser.httpOnly': {
    zh: '仅支持打开http或https页面',
    en: 'Only http or https pages are supported',
  },
  'browser.invalidRequest': { zh: '无效的浏览器窗口请求', en: 'Invalid browser window request' },
  'browser.invalidWalletRequest': {
    zh: '无效的钱包确认请求',
    en: 'Invalid wallet confirmation request',
  },
  'input.minPrice': { zh: '价格最小', en: 'Min Price' },
  'input.minPriceTitle': { zh: '价格最小值', en: 'Minimum Price' },
  'input.maxPrice': { zh: '价格最大', en: 'Max Price' },
  'input.maxPriceTitle': { zh: '价格最大值', en: 'Maximum Price' },
  'input.minShares': { zh: '份额最小', en: 'Min Shares' },
  'input.minSharesTitle': { zh: '份额最小值', en: 'Minimum Shares' },
  'input.maxShares': { zh: '份额最大', en: 'Max Shares' },
  'input.maxSharesTitle': { zh: '份额最大值', en: 'Maximum Shares' },
  'input.allSides': { zh: '全部方向', en: 'All Sides' },
};

const phraseTerms: Record<string, TranslationTerm> = {
  'settings.syncDescription': {
    zh: '从 R2 快照拉取开放事件及市场数据，写入本地 SQLite 缓存，供事件列表使用。',
    en: 'Fetch open events and market data from the R2 snapshot into the local SQLite cache for event lists.',
  },
  'settings.scheduleDescription': {
    zh: '每隔设定时间自动执行一次完整数据同步。',
    en: 'Automatically run a full data sync at the configured interval.',
  },
  'language.description': {
    zh: '默认使用系统语言；系统语言不支持时使用英文。',
    en: 'Use the system language by default. Unsupported system languages use English.',
  },
  'dialog.closeHasRunsPrefix': { zh: '当前交易窗口有', en: 'This trading window has' },
  'dialog.closeHasRunsSuffix': { zh: '个运行中的策略', en: 'running strategies' },
  'dialog.closeHasRunsQuestion': {
    zh: '关闭窗口会先停止这些策略并撤销相关挂单，是否继续',
    en: 'Closing the window will stop these strategies and cancel related orders. Continue',
  },
  'dialog.closeBlocked': {
    zh: '当前市场有运行中的策略，请先停止策略并撤销挂单后再关闭交易窗口。',
    en: 'A strategy is running on the current market. Stop it and cancel orders before closing the trading window.',
  },
  'dialog.stopStrategyConfirm': {
    zh: '停止策略会取消当前市场所有挂单，确定停止？',
    en: 'Stopping the strategy will cancel all orders on the current market. Stop now?',
  },
  'trading.configHintPrefix': {
    zh: '配置可交易钱包后可查看',
    en: 'Configure a tradable wallet to view ',
  },
  'trading.configHint': {
    zh: '请先在钱包管理中配置可交易钱包。',
    en: 'Configure a tradable wallet in Wallets first.',
  },
  'filters.loadFailed': { zh: '加载筛选配置失败', en: 'Failed to load filter configuration' },
  'date.endsPrefix': { zh: '结束 ', en: 'Ends ' },
  'market.volumePrefix': { zh: '成交量 ', en: 'Volume ' },
  'market.liquidityPrefix': { zh: '流动性 ', en: 'Liquidity ' },
  'count.totalPrefix': { zh: '共 ', en: 'Total ' },
  'count.eventsSuffix': { zh: ' 条事件', en: ' events' },
  'count.marketsSuffix': { zh: ' 条市场', en: ' markets' },
  'count.itemsSuffix': { zh: ' 条', en: ' items' },
  'count.marketSuffix': { zh: ' 个市场', en: ' markets' },
  'count.tradesSuffix': { zh: ' 笔', en: ' trades' },
  'count.seriesSuffix': { zh: ' 条走势', en: ' series' },
  'count.pointsSuffix': { zh: ' 点', en: ' points' },
  'page.prefix': { zh: '第 ', en: 'Page ' },
  'page.suffix': { zh: ' 页', en: ' page' },
  'run.accountPrefix': { zh: '钱包：', en: 'Wallet: ' },
  'run.startedPrefix': { zh: '启动：', en: 'Started: ' },
  'strategy.stopFailedPrefix': { zh: '停止策略失败：', en: 'Failed to stop strategy: ' },
  'sync.completePrefix': { zh: '同步完成：', en: 'Sync complete: ' },
  'sync.stoppedPrefix': { zh: '同步已停止：', en: 'Sync stopped: ' },
  'sync.failedPrefix': { zh: '同步失败：', en: 'Sync failed: ' },
  'sync.fetchedPrefix': { zh: '已获取 ', en: 'fetched ' },
  'page.separator': { zh: '页，', en: ', ' },
  'generic.no': { zh: '暂无', en: 'No ' },
};

const dynamicRules: Array<[RegExp, string]> = [
  [/^第\s*(\d+)\s*\/\s*(\d+)\s*页$/u, 'Page $1 / $2'],
  [/^第\s*(\d+)\s*页，已获取\s*(\d+)\s*条事件$/u, 'Page $1, fetched $2 events'],
  [/^同步完成：共\s*(\d+)\s*条事件$/u, 'Sync complete: $1 events'],
  [/^同步已停止：已获取\s*(\d+)\s*条事件$/u, 'Sync stopped: fetched $1 events'],
  [/^同步失败：(.+)$/u, 'Sync failed: $1'],
  [/^(.+)\s*条$/u, '$1 items'],
  [/^共\s*(.+)\s*个市场$/u, '$1 markets'],
  [/^Top\s*(\d+)\s*持有者$/u, 'Top $1 Holders'],
  [/^(\d+)\s*条走势\s*·\s*(\d+)\s*点$/u, '$1 series · $2 points'],
  [/^选项\s*(\d+)$/u, 'Option $1'],
  [/^(.+)\s*加载失败：(.+)$/u, 'Failed to load $1: $2'],
];

const originalTextNodes = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Map<string, string>>();

let activeLocale: AppLocale = 'en-US';
let observer: MutationObserver | null = null;
let translating = false;
let originalDocumentTitle = '';
let exactEnglish: Map<string, string> | null = null;
let replacementEnglish: Array<[string, string]> | null = null;

function normalizeKey(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/[：]/g, ':')
    .replace(/[，。？！“”（）]/g, '')
    .replace(/[·]/g, ' ')
    .trim();
}

function getExactEnglish(): Map<string, string> {
  if (exactEnglish) return exactEnglish;
  exactEnglish = new Map<string, string>();
  for (const term of Object.values(exactTerms)) {
    exactEnglish.set(term.zh, term.en);
    exactEnglish.set(normalizeKey(term.zh), term.en);
    exactEnglish.set(term.zh.replace(/\s+/g, ''), term.en);
  }
  return exactEnglish;
}

function getReplacementEnglish(): Array<[string, string]> {
  if (replacementEnglish) return replacementEnglish;
  replacementEnglish = Object.values(phraseTerms)
    .map((term) => [term.zh, term.en] as [string, string])
    .sort((a, b) => b[0].length - a[0].length);
  return replacementEnglish;
}

export function translateTerm(key: string, locale = activeLocale): string {
  const term = exactTerms[key] ?? phraseTerms[key];
  if (!term) return key;
  return locale === 'zh-CN' ? term.zh : term.en;
}

function preserveWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

function translateEnglishText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !HAN_RE.test(trimmed)) return value;

  const exact =
    getExactEnglish().get(trimmed) ??
    getExactEnglish().get(normalizeKey(trimmed)) ??
    getExactEnglish().get(trimmed.replace(/\s+/g, ''));
  if (exact) return preserveWhitespace(value, exact);

  for (const [pattern, replacement] of dynamicRules) {
    if (pattern.test(trimmed)) {
      return preserveWhitespace(value, trimmed.replace(pattern, replacement));
    }
  }

  let next = trimmed;
  for (const [source, target] of getReplacementEnglish()) {
    next = next.split(source).join(target);
    next = next.split(normalizeKey(source)).join(target);
  }

  next = next
    .replace(/：/g, ': ')
    .replace(/，/g, ', ')
    .replace(/。/g, '.')
    .replace(/？/g, '?')
    .replace(/！/g, '!')
    .replace(/（/g, ' (')
    .replace(/）/g, ')')
    .replace(/\s+/g, ' ')
    .trim();

  return preserveWhitespace(value, next);
}

export function translateText(value: string, locale = activeLocale): string {
  if (locale === 'zh-CN') return value;
  return translateEnglishText(value);
}

function translateTextNode(node: Text, refreshOriginal = false): void {
  if (refreshOriginal && !HAN_RE.test(node.data)) {
    originalTextNodes.delete(node);
    return;
  }
  const original = originalTextNodes.get(node) ?? node.data;
  if ((refreshOriginal || !originalTextNodes.has(node)) && HAN_RE.test(node.data)) {
    originalTextNodes.set(node, node.data);
  }
  const source = originalTextNodes.get(node) ?? original;
  if (!source) return;
  const translated = translateText(source, activeLocale);
  if (node.data !== translated) {
    node.data = translated;
  }
}

function translateElementAttrs(element: Element, refreshOriginal = false): void {
  let attrMap = originalAttrs.get(element);
  for (const attr of TRANSLATABLE_ATTRS) {
    const value = element.getAttribute(attr);
    if (!value) continue;
    if (refreshOriginal && !HAN_RE.test(value)) {
      attrMap?.delete(attr);
      continue;
    }
    if (!attrMap && HAN_RE.test(value)) {
      attrMap = new Map<string, string>();
      originalAttrs.set(element, attrMap);
    }
    if (attrMap && (refreshOriginal || !attrMap.has(attr)) && HAN_RE.test(value)) {
      attrMap.set(attr, value);
    }
    const source = attrMap?.get(attr);
    if (!source) continue;
    const translated = translateText(source, activeLocale);
    if (element.getAttribute(attr) !== translated) {
      element.setAttribute(attr, translated);
    }
  }
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  return ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName);
}

function translateNode(node: Node): void {
  if (shouldSkipNode(node)) return;
  if (node.nodeType === Node.TEXT_NODE) {
    translateTextNode(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const element = node as Element;
  translateElementAttrs(element);
  for (const child of Array.from(element.childNodes)) {
    translateNode(child);
  }
}

export function translateDocument(locale: AppLocale): void {
  activeLocale = locale;
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  translating = true;
  try {
    translateNode(document.body);
    if (document.title) {
      if (!originalDocumentTitle || HAN_RE.test(document.title)) {
        originalDocumentTitle = document.title;
      }
      const translatedTitle = translateText(originalDocumentTitle, locale);
      if (document.title !== translatedTitle) {
        document.title = translatedTitle;
      }
    }
  } finally {
    translating = false;
  }
}

export function startAutoTranslate(locale: AppLocale): void {
  if (typeof document === 'undefined' || observer) return;
  translateDocument(locale);
  observer = new MutationObserver((mutations) => {
    if (translating) return;
    translating = true;
    try {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          translateTextNode(mutation.target as Text, true);
        } else if (mutation.type === 'attributes') {
          translateElementAttrs(mutation.target as Element, true);
        } else {
          for (const node of Array.from(mutation.addedNodes)) {
            translateNode(node);
          }
        }
      }
    } finally {
      translating = false;
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRS],
  });
}
