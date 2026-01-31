// --- Configuration ---
const ANILIST_API_URL = 'https://graphql.anilist.co';
const ANNICT_API_URL = 'https://api.annict.com/v1/works';
const ANNICT_TOKEN = 'KEgdY8ZMjgK3kr5zofuAk6yVrtn7JaRknneSHZLjjow'; // Provided by User

// --- State ---
let allAnime = [];
let statusMap = {};
let unsavedChanges = 0; // Track changes for backup reminder

let currentFilter = 'ALL';
let currentSort = 'POPULARITY_DESC';
let hideKids = false;

// --- Initialization ---
const root = document.getElementById('anime-list-root');
const statusDiv = document.getElementById('loading-status');
let debugLog = []; // Store debug info

// debug helper
function addDebug(name, info) {
    debugLog.push({ name, info });
    console.log(`[DEBUG] ${name}:`, info);
}

function showDebugModal() {
    const failures = allAnime.filter(a => !a.description_jp);
    const msg = failures.map(a =>
        `❌ ${a.title.native || a.title.english}\n   WikiKey: ${a._wikiTitle || 'N/A'}\n   Fallback: ${a._fallbackTitle || 'N/A'}`
    ).join('\n\n');

    // Output to a dedicated div for automation tools to read easily
    let debugContainer = document.getElementById('debug-output-container');
    if (!debugContainer) {
        debugContainer = document.createElement('pre');
        debugContainer.id = 'debug-output-container';
        debugContainer.style.background = '#000';
        debugContainer.style.color = '#0f0';
        debugContainer.style.padding = '10px';
        debugContainer.style.position = 'fixed';
        debugContainer.style.bottom = '0';
        debugContainer.style.left = '0';
        debugContainer.style.right = '0';
        debugContainer.style.height = '300px';
        debugContainer.style.overflow = 'auto';
        debugContainer.style.zIndex = '9999';
        document.body.appendChild(debugContainer);
    }
    debugContainer.textContent = `【未取得リスト: ${failures.length}件】\n\n${msg}`;
}


// --- Modal Logic ---
let ytPlayer = null;

// Load YouTube IFrame API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function openModal(videoId) {
    let modal = document.getElementById('pv-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pv-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close" onclick="closeModal()">×</button>
                <div id="player-container"></div>
                <div class="modal-fallback">
                    <a id="fallback-link" href="#" target="_blank" class="fallback-btn">
                        YouTubeで見る (再生できない場合)
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }

    const fallbackLink = modal.querySelector('#fallback-link');
    fallbackLink.href = `https://www.youtube.com/watch?v=${videoId}`;
    modal.classList.add('active');

    const container = modal.querySelector('#player-container');

    // Use YT.Player if API is loaded and it's not a file:// protocol usually,
    // but on file://, the direct iframe with specific parameters often works better.
    if (window.YT && window.YT.Player && window.location.protocol !== 'file:') {
        if (ytPlayer) {
            ytPlayer.loadVideoById(videoId);
        } else {
            ytPlayer = new YT.Player('player-container', {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: {
                    'autoplay': 1,
                    'origin': window.location.origin
                }
            });
        }
    } else {
        // Fallback or file:// specific fix
        // Using youtube-nocookie and referrerpolicy="no-referrer" for local files
        const origin = 'https://www.youtube.com';
        container.innerHTML = `<iframe width="100%" height="100%" 
            src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1&origin=${origin}" 
            frameborder="0" 
            allow="autoplay; encrypted-media; picture-in-picture" 
            allowfullscreen
            referrerpolicy="no-referrer"></iframe>`;
    }
}

function closeModal() {
    const modal = document.getElementById('pv-modal');
    if (modal) {
        modal.classList.remove('active');
        if (ytPlayer && ytPlayer.stopVideo) {
            try { ytPlayer.stopVideo(); } catch (e) { }
        }
        const container = modal.querySelector('#player-container');
        if (container) container.innerHTML = '';
    }
}

// --- Backup Logic ---
function exportData() {
    const dataStr = JSON.stringify(statusMap, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime_backup_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    unsavedChanges = 0;
    updateBackupReminder();
    showToast("バックアップを保存しました");
}

function triggerImport() { document.getElementById('backup-file').click(); }

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const json = JSON.parse(e.target.result);
            if (confirm(`バックアップファイルを読み込みますか？\n現在のデータは上書きされます。`)) {
                statusMap = json;
                localStorage.setItem('animeStatusMap', JSON.stringify(statusMap));
                unsavedChanges = 0;
                updateBackupReminder();
                render();
                showToast("復元が完了しました");
            }
        } catch (err) {
            alert("ファイルの読み込みに失敗しました。");
            console.error(err);
        }
    };
    reader.readAsText(file);
    input.value = '';
}

function init() {
    const stored = localStorage.getItem('animeStatusMap');
    if (stored) statusMap = JSON.parse(stored);
    fetchRange();
    const savedTheme = localStorage.getItem('theme') || 'midnight';
    setTheme(savedTheme);
    document.getElementById('theme-select').value = savedTheme;
}

function setTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
    localStorage.setItem('theme', themeName);
}

// --- Data Fetching Logic (Hybrid: Anilist + Annict + Wiki) ---
async function fetchRange() {
    const startYear = parseInt(document.getElementById('start-year').value);
    const startSeason = document.getElementById('start-season').value;
    const endYear = parseInt(document.getElementById('end-year').value);
    const endSeason = document.getElementById('end-season').value;
    const includeAiring = document.getElementById('include-airing-check').checked;

    const seasons = generateSeasonList(startYear, startSeason, endYear, endSeason);

    if (seasons.length === 0) { alert("終了時期は開始時期より未来に設定してください。"); return; }
    if (seasons.length > 8 && !confirm("2年以上（8シーズン以上）の範囲です。時間がかかりますが続行しますか？")) return;

    statusDiv.textContent = "データ取得中...";
    allAnime = [];
    document.querySelector('.fetch-btn').disabled = true;

    for (const s of seasons) {
        statusDiv.textContent = `${s.year}年 ${getSeasonNameJP(s.season)} 取得中...`;
        await fetchSeason(s.season, s.year, includeAiring);
    }

    statusDiv.innerHTML = `全 ${allAnime.length} 件 取得完了 <button onclick="showDebugModal()" style="font-size:10px; cursor:pointer;">[DEBUG]</button>`;
    document.querySelector('.fetch-btn').disabled = false;
    render();
}

function generateSeasonList(startYear, startSeason, endYear, endSeason) {
    const seasonOrder = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
    const seasons = [];
    let currentYear = startYear;
    let currentIndex = seasonOrder.indexOf(startSeason);

    while (currentYear < endYear || (currentYear === endYear && currentIndex <= seasonOrder.indexOf(endSeason))) {
        seasons.push({ season: seasonOrder[currentIndex], year: currentYear });
        currentIndex++;
        if (currentIndex >= 4) { currentIndex = 0; currentYear++; }
        if (currentYear > endYear + 5) break;
    }
    return seasons;
}

function getSeasonNameJP(season) {
    const map = { WINTER: '冬', SPRING: '春', SUMMER: '夏', FALL: '秋' };
    return map[season];
}

async function fetchSeason(season, year, includeAiring) {
    const statusFilter = includeAiring ? undefined : 'FINISHED';

    // 1. Fetch Anilist
    const query = `
    query ($page: Int, $season: MediaSeason, $seasonYear: Int, $status: MediaStatus) {
        Page (page: $page, perPage: 50) {
            media (season: $season, seasonYear: $seasonYear, status: $status, type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
                id
                title { romaji english native }
                genres
                averageScore
                description(asHtml: false)
                episodes
                startDate { year month day }
                endDate { year month day }
                coverImage { large }
                trailer { id site }
            }
        }
    }
    `;

    try {
        const response = await fetch(ANILIST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                query,
                variables: { page: 1, season, seasonYear: year, status: statusFilter }
            })
        });
        const json = await response.json();
        if (json.data && json.data.Page) {
            let pageAnime = json.data.Page.media;

            // 2. Fetch Annict to get Wiki URLs
            statusDiv.textContent += " (Annict照合中...)";
            const annictWorks = await fetchAnnictWorks(season, year);

            // 3. Merge & Fetch Wiki Text
            if (annictWorks.length > 0) {
                statusDiv.textContent += " (Wiki詳細取得...)";
                await enhanceWithWiki(pageAnime, annictWorks);
            }

            allAnime = [...allAnime, ...pageAnime];
        }
    } catch (e) {
        console.error("Fetch Error", e);
    }
    await new Promise(r => setTimeout(r, 200));
}

// --- Annict Logic ---
async function fetchAnnictWorks(season, year) {
    // Convert Season to Annict format (e.g., 2025-winter)
    const seasonMap = { WINTER: 'winter', SPRING: 'spring', SUMMER: 'summer', FALL: 'autumn' };
    const annictSeason = `${year}-${seasonMap[season]}`;

    // Fetch up to 100 works (should cover most popular ones)
    const url = `${ANNICT_API_URL}?fields=title,wikipedia_url&per_page=50&filter_season=${annictSeason}&sort_watchers_count=desc`;
    const headers = { "Authorization": `Bearer ${ANNICT_TOKEN}` };

    try {
        const res = await fetch(url, { headers });
        const json = await res.json();
        return json.works || [];
    } catch (e) {
        console.warn("Annict Fetch Error", e);
        return [];
    }
}

// --- Wiki Logic (Hybrid: Annict URL -> Fallback Key Search) ---
async function enhanceWithWiki(anilistAnime, annictWorks) {
    const wikiTitles = [];

    // Helper: Normalize title for comparison (remove spaces, symbols)
    const normalize = (s) => (s || '').replace(/[\s\u3000\-\:：！!？?]/g, '').toLowerCase();

    // Custom Mappings to fix failures
    const CUSTOM_WIKI_MAPPINGS = {
        "ワンパンマン３": "ワンパンマン",
        "SPY×FAMILY Season 3": "SPY×FAMILY",
        "僕のヒーローアカデミア FINAL SEASON": "僕のヒーローアカデミア (アニメ)",
        "暗殺者である俺のステータスが 勇者よりも明らかに強いのだが": "暗殺者である俺のステータスが勇者よりも明らかに強いのだが",
        "最後にひとつだけお願いしてもよろしいでしょうか": "最後にひとつだけお願いしてもよろしいでしょうか",
        "とんでもスキルで異世界放浪メシ2": "とんでもスキルで異世界放浪メシ",
        "信じていた仲間達にダンジョン奥地で殺されかけたがギフト『無限ガチャ』でレベル9999の仲間達を手に入れて元パーティーメンバーと世界に復讐＆『ざまぁ！』します！": "信じていた仲間達にダンジョン奥地で殺されかけたがギフト『無限ガチャ』でレベル9999の仲間達を手に入れて元パーティーメンバーと世界に復讐&『ざまぁ!』します!",
        "SANDA": "SANDA",
        "友達の妹が俺にだけウザい": "友達の妹が俺にだけウザい",
        "野生のラスボスが現れた！": "野生のラスボスが現れた!",
        "私を喰べたい、ひとでなし": "私を喰べたい、ひとでなし",
        "かぐや様は告らせたい 大人への階段": "かぐや様は告らせたい〜天才たちの恋愛頭脳戦〜",
        "無職の英雄 別にスキルなんか要らなかったんだが": "無職の英雄 別にスキルなんか要らなかったんだが",
        "永久のユウグレ": "永久のユウグレ",
        "味方が弱すぎて補助魔法に徹していた宮廷魔法師、追放されて最強を目指す": "味方が弱すぎて補助魔法に徹していた宮廷魔法師、追放されて最強を目指す",
        "らんま1/2 (2024) 第2期": "らんま1/2",
        "素材採取家の異世界旅行記": "素材採取家の異世界旅行記",
        "不器用な先輩。": "不器用な先輩。",
        "嘆きの亡霊は引退したい 2": "嘆きの亡霊は引退したい",
        "矢野くんの普通の日々": "矢野くんの普通の日々",
        "父は英雄、母は精霊、娘の私は転生者。": "父は英雄、母は精霊、娘の私は転生者。",
        "悪食令嬢と狂血公爵　～その魔物、私が美味しくいただきます！～": "悪食令嬢と狂血公爵 〜その魔物、私が美味しくいただきます!〜",
        "ウマ娘 シンデレラグレイ 第2クール": "ウマ娘 シンデレラグレイ",
        "ディズニー ツイステッドワンダーランド ザ アニメーション シーズン1「エピソード オブ ハーツラビュル」": "ディズニー ツイステッドワンダーランド",
        "終末のワルキューレ III": "終末のワルキューレ",
        "ワンダンス": "ワンダンス",
        "顔に出ない柏田さんと顔に出る太田君": "顔に出ない柏田さんと顔に出る太田君",
        "ゾンビランドサガ ゆめぎんがパラダイス": "ゾンビランドサガ",
        "アンデッドアンラック Winter編": "アンデッドアンラック",
        "結婚指輪物語Ⅱ": "結婚指輪物語",
        "機械じかけのマリー": "機械じかけのマリー",
        "転生悪女の黒歴史": "転生悪女の黒歴史",
        "ちゃんと吸えない吸血鬼ちゃん": "ちゃんと吸えない吸血鬼ちゃん",
        "太陽よりも眩しい星": "太陽よりも眩しい星",
        "さわらないで小手指くん": "さわらないで小手指くん",
        "3年Z組銀八先生": "銀魂 (アニメ)",
        "異世界かるてっと 3": "異世界かるてっと",
        "キミと越えて恋になる": "キミと越えて恋になる",
        "Let’s Play クエストだらけのマイライフ": "Let's Play クエストだらけのマイライフ",
        "笑顔のたえない職場です。": "笑顔のたえない職場です。",
        "アルマちゃんは家族になりたい": "少女型兵器は家族になりたい",
        "終末ツーリング": "終末ツーリング",
        "呪術廻戦『渋谷事変 特別編集版』×『死滅回游 先行上映』": "呪術廻戦",
        "かくりよの宿飯 第２期": "かくりよの宿飯",
        "果てしなきスカーレット": "果てしなきスカーレット",
        "キングダム 第6シリーズ": "キングダム (漫画)",
        "キャッツ♥アイ (2025)": "キャッツ♥アイ",
        "忍者と極道": "忍者と極道",
        "ALL YOU NEED IS KILL": "All You Need Is Kill",
        "わたしが恋人になれるわけないじゃん、ムリムリ! (※ムリじゃなかった!?)〜ネクストシャイン！〜": "わたしが恋人になれるわけないじゃん、ムリムリ! (※ムリじゃなかった!?)",
        "プリンセス・プリンシパル Crown Handler 第4章「Fabulous Platypus」": "プリンセス・プリンシパル Crown Handler",
        "藤本タツキ 17-26": "藤本タツキ"
    };

    anilistAnime.forEach(anime => {
        const jpTitle = anime.title.native;
        if (!jpTitle) return;

        // Priority 0: Custom Mapping
        if (CUSTOM_WIKI_MAPPINGS[jpTitle]) {
            anime._wikiTitle = CUSTOM_WIKI_MAPPINGS[jpTitle];
            wikiTitles.push(anime._wikiTitle);
            return;
        }

        // 1. Try Annict Match
        const nTitle = normalize(jpTitle);
        // Find best match in Annict
        const match = annictWorks.find(w => {
            const wTitle = normalize(w.title);
            return wTitle === nTitle || wTitle.includes(nTitle) || nTitle.includes(wTitle);
        });

        if (match && match.wikipedia_url) {
            try {
                const urlObj = new URL(match.wikipedia_url);
                const titlePart = urlObj.pathname.split('/').pop();
                // Replace underscores with spaces for API matching consistency
                const decodedTitle = decodeURIComponent(titlePart).replace(/_/g, ' ');
                anime._wikiTitle = decodedTitle; // Priority 1
                wikiTitles.push(decodedTitle);
            } catch (e) { }
        }

        // 2. Fallback: Direct Search by Title (if Annict failed)
        // Clean title for Wiki search
        let searchT = jpTitle
            .replace(/\s\d+(st|nd|rd|th)?\s?season/ig, '')
            .replace(/第[0-9０-９]+(期|シリーズ|クール|章|部)/g, '') // Fullwidth/Halfwidth numbers + unit
            .replace(/\s(II|III|IV|V|VI|VII|Ⅱ|Ⅲ|Ⅳ|Ⅴ)\s*$/g, '') // Roman numerals
            .replace(/[\s　]*[0-9０-９]+$/g, '') // Trailing numbers (full/half width, with/without space)
            .replace(/(FINAL\s?SEASON|The\s?Final|Final\s?Chapter)/i, '')
            .replace(/シーズン\d+/g, '')
            .replace(/『.*』/g, '') // Remove brackets like 『渋谷事変』
            .replace(/[(（].+?[)）]/g, '') // Remove (2025) etc
            .trim();

        anime._fallbackTitle = searchT;
        wikiTitles.push(searchT);
    });

    if (wikiTitles.length === 0) return;

    // Fetch Wiki Summaries (Batch)
    const uniqueTitles = [...new Set(wikiTitles)];
    const chunks = [];
    for (let i = 0; i < uniqueTitles.length; i += 20) {
        chunks.push(uniqueTitles.slice(i, i + 20));
    }

    for (const chunk of chunks) {
        const titlesStr = chunk.join('|');
        const callbackName = 'wikiCallback_' + Math.floor(Math.random() * 100000);
        const url = `https://ja.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&redirects=1&format=json&titles=${encodeURIComponent(titlesStr)}&callback=${callbackName}`;

        await new Promise((resolve) => {
            window[callbackName] = function (data) {
                try {
                    const pages = data.query ? data.query.pages : {};
                    const redirects = data.query ? (data.query.redirects || []) : [];
                    const normalized = data.query ? (data.query.normalized || []) : [];

                    // Create lookup maps for redirects and normalization
                    const normMap = {};
                    normalized.forEach(n => normMap[n.from] = n.to);
                    const redMap = {};
                    redirects.forEach(r => redMap[r.from] = r.to);

                    // Helper to resolve title chain: Original -> Normalized -> Redirected
                    const resolveTitle = (t) => {
                        let curr = t;
                        if (normMap[curr]) curr = normMap[curr];
                        if (redMap[curr]) curr = redMap[curr];
                        return curr;
                    };

                    anilistAnime.forEach(anime => {
                        // Prevent overwriting if already found in a previous chunk/iteration
                        if (anime.description_jp) return;

                        let desc = null;

                        // Priority 1: Check WikiTitle (with redirect resolution)
                        if (anime._wikiTitle && pages) {
                            const targetTitle = resolveTitle(anime._wikiTitle);
                            for (const k in pages) {
                                if (k === '-1') continue;
                                if (pages[k].title === targetTitle) {
                                    desc = pages[k].extract;
                                    break;
                                }
                            }
                        }

                        // Priority 2: Check Fallback Title (if P1 failed)
                        if (!desc && anime._fallbackTitle && pages) {
                            // Also try resolving fallback title
                            const targetFallback = resolveTitle(anime._fallbackTitle);
                            for (const k in pages) {
                                if (k === '-1') continue;
                                // Loose match on either original fallback or resolved fallback
                                const pageTitle = pages[k].title;
                                if (pageTitle.includes(anime._fallbackTitle) || anime._fallbackTitle.includes(pageTitle) ||
                                    pageTitle === targetFallback) {
                                    desc = pages[k].extract;
                                    break;
                                }
                            }
                        }

                        if (desc && desc.length > 5) {
                            anime.description_jp = desc;
                        }
                    });
                } catch (e) { console.error("Wiki Decode Error", e); }
                document.body.removeChild(script);
                delete window[callbackName];
                resolve();
            };
            const script = document.createElement('script');
            script.src = url;
            script.onerror = () => { console.warn("Wiki JSONP Error"); resolve(); };
            document.body.appendChild(script);
        });
    }
}

// --- Logic & Helpers ---
function getStatus(id) { return statusMap[id] || 'WATCHING'; }

function setStatus(id, status) {
    if (status === 'WATCHING') delete statusMap[id];
    else statusMap[id] = status;
    localStorage.setItem('animeStatusMap', JSON.stringify(statusMap));
    unsavedChanges++;
    updateBackupReminder();
    showToast("保存しました");
    render();
}

function updateBackupReminder() {
    const btn = document.querySelector('button[onclick="exportData()"]');
    if (!btn) return;
    if (unsavedChanges > 0) {
        btn.classList.add('needs-backup');
        if (!btn.querySelector('.backup-reminder-dot')) {
            const dot = document.createElement('div');
            dot.className = 'backup-reminder-dot';
            btn.appendChild(dot);
        }
    } else {
        btn.classList.remove('needs-backup');
        const dot = btn.querySelector('.backup-reminder-dot');
        if (dot) dot.remove();
    }
}

function showToast(msg) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

function getVodLinks(anime) {
    const title = anime.title.native || anime.title.english;
    const netflixUrl = `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;
    const primeUrl = `https://www.amazon.co.jp/s?k=${encodeURIComponent(title + " アニメ")}`;
    return { netflixUrl, primeUrl };
}

// --- Render ---
function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${filter}`).classList.add('active');
    render();
}
function setSort(sort) { currentSort = sort; render(); }
function toggleKidsFilter(checked) { hideKids = checked; render(); }

function render() {
    root.innerHTML = '';
    let displayList = allAnime.filter(anime => {
        const status = getStatus(anime.id);
        if (hideKids && anime.genres.includes('Kids')) return false;
        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'WATCHED' && status === 'WATCHED') return true;
        if (currentFilter === 'DROPPED' && status === 'DROPPED') return true;
        if (currentFilter === 'WATCHING' && status === 'WATCHING') return true;
        return false;
    });

    displayList.sort((a, b) => {
        if (currentSort === 'SCORE_DESC') return (b.averageScore || 0) - (a.averageScore || 0);
        if (currentSort === 'TITLE_ROMAJI') return (a.title.romaji || '').localeCompare(b.title.romaji || '');
        return 0; // POPULARITY_DESC
    });

    if (displayList.length === 0) {
        root.innerHTML = '<div style="text-align:center; color:#666; padding:40px;">該当するアニメがありません</div>';
        return;
    }

    displayList.forEach(anime => {
        const status = getStatus(anime.id);
        const { netflixUrl, primeUrl } = getVodLinks(anime);
        const score = anime.averageScore ? `★ ${anime.averageScore}%` : 'N/A';
        const episodes = anime.episodes ? `全 ${anime.episodes} 話` : '放送中';
        const formatDate = (d) => (!d || !d.year) ? '?' : `${d.year}/${d.month || '?'}/${d.day || '?'}`;
        const dateRange = `${formatDate(anime.startDate)} - ${formatDate(anime.endDate)}`;
        const genres = anime.genres.slice(0, 3).map(g => `<span class="genre">${g}</span>`).join('');

        // Priority: Wiki (JP via Annict) > Wiki (JP via Guess) > Anilist (EN)
        let summary = anime.description_jp || anime.description || "あらすじ情報なし";
        summary = summary.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '');
        // Truncate if too long?
        if (summary.length > 300) summary = summary.slice(0, 300) + '...';

        let itemClass = 'anime-item';
        let badgeHtml = '';
        if (status === 'WATCHED') { itemClass += ' status-watched'; badgeHtml = '<div class="status-badge watched">視聴済み</div>'; }
        if (status === 'DROPPED') { itemClass += ' status-dropped'; badgeHtml = '<div class="status-badge dropped">ゴミ箱</div>'; }
        const watchedActive = status === 'WATCHED' ? 'active-watched' : '';
        const droppedActive = status === 'DROPPED' ? 'active-dropped' : '';

        const html = `
        <div class="${itemClass}" 
             onmouseenter="setGlobalBg('${anime.coverImage.large}')" 
             onmouseleave="clearGlobalBg()">
            ${badgeHtml}
            <div class="img-box">
                <img src="${anime.coverImage.large}" loading="lazy" alt="cover">
            </div>
            <div class="info-box">
                <div class="top-row"><h3 class="title">${anime.title.native || anime.title.english}</h3></div>
                <div class="meta-row">
                    <span class="score-badge">${score}</span>
                    <span class="ep-count">${episodes}</span>
                    <span class="date-range">${dateRange}</span>
                    ${genres}
                </div>
                <p class="summary">${summary}</p>
            </div>
            <div class="action-box">
                <div class="vod-links">
                    <a href="${netflixUrl}" target="_blank" class="vod-btn netflix" title="Netflixで検索">
                        <img src="netflix_fixed.svg" alt="Netflix">
                    </a>
                    <a href="${primeUrl}" target="_blank" class="vod-btn prime" title="Prime Videoで検索">
                        <img src="prime_simple.svg" alt="Prime Video">
                    </a>
                    ${anime.trailer && anime.trailer.site === 'youtube'
                ? `<button class="play-btn" onclick="openModal('${anime.trailer.id}')" title="PVを再生">
                     <img src="youtube_icon.svg" alt="YouTube">
                   </button>`
                : ''}
                </div>
                <div class="status-btn-group">
                    <button class="status-btn ${droppedActive}" onclick="setStatus(${anime.id}, '${status === 'DROPPED' ? 'WATCHING' : 'DROPPED'}')">
                        🗑 みない
                    </button>
                    <button class="status-btn ${watchedActive}" onclick="setStatus(${anime.id}, '${status === 'WATCHED' ? 'WATCHING' : 'WATCHED'}')">
                        ✓ みた
                    </button>
                </div>
            </div>
        </div>
        `;
        root.insertAdjacentHTML('beforeend', html);
    });
}

function setGlobalBg(url) {
    const bg = document.getElementById('global-bg-overlay');
    if (bg) {
        bg.style.backgroundImage = `url('${url}')`;
        bg.classList.add('active');
    }
}

function clearGlobalBg() {
    const bg = document.getElementById('global-bg-overlay');
    if (bg) {
        bg.classList.remove('active');
    }
}

init();
