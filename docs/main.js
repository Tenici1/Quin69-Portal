(async function () {

  let wordTimestamps = {}; // { word: [timestamp1, timestamp2, ...] }
  const STOP_WORDS = new Set([
    'the', 'and', 'you', 'that', 'for', 'are', 'with', 'this', 'have', 'but',
    'was', 'not', 'your', 'all', 'can', 'our', 'will', 'just', 'like', 'get',
    'has', 'had', 'its', 'how', 'why', 'when', 'where', 'what', 'who', 'which',
    'their', 'there', 'from', 'they', 'been', 'were', 'then', 'than', 'some',
    'because', 'would', 'could', 'should', 'might', 'well', 'also', 'very',
    'into', 'through', 'about', 'upon', 'since', 'until', 'while', 'though',
    'although', 'however', 'therefore', 'moreover', 'furthermore', 'nevertheless',
    'nonetheless', 'not', 'no', 'yes', 'ok', 'okay', 'hey', 'hi', 'hello', 'lol',
    'lmfao', 'lmao', 'rofl', 'haha', 'hehe', 'xd', 'pls', 'please', 'thx', 'thanks',
    'thank', 'ty', 'omg', 'wtf', 'brb', 'afk', 'imo', 'imho', 'btw', 'fyi',
    'irl', 'tbh', 'idk', 'smh', 'nsfw', 'sfw', 'gg', 'wp', 'gl', 'hf', 'mb',
    'rip', 'op', 'nerf', 'buff', 'patch', 'update', 'game', 'play', 'player',
    'stream', 'twitch', 'chat', 'viewer', 'sub', 'follow', 'bit', 'donation',
    'quin', 'quin69', '69'
  ]);

  // Image cache to prevent re-downloading
  const imageCache = new Map();

  function getCachedImage(url, alt, className) {
    const cached = imageCache.get(url);

    if (cached instanceof Image) {
      // 1. BEST CASE: Image is loaded and in our cache. Return a clone.
      return cached.cloneNode(false);
    }

    if (cached === 'loading') {
      // 2. GOOD CASE: Master image is loading. Make a temporary image.
      //    The browser's HTTP cache will handle the duplicate request.
      const tempImg = new Image();
      tempImg.src = url;
      tempImg.alt = alt;
      tempImg.className = className;
      return tempImg;
    }

    // 3. FIRST TIME: We've never seen this URL.
    //    Create the "master" image.
    const masterImg = new Image();
    masterImg.src = url;
    masterImg.alt = alt;
    masterImg.className = className;

    // Set status to 'loading' so other calls know to wait
    imageCache.set(url, 'loading');

    // When it finishes loading, cache the *loaded* master image
    masterImg.onload = () => {
      imageCache.set(url, masterImg);
    };

    // If it fails, remove it so we can try again later
    masterImg.onerror = () => {
      imageCache.delete(url);
      console.warn('Failed to load master cached image:', url);
    };

    // Return the master image for this first request.
    // It will be added to the DOM and load itself.
    return masterImg;
  }

  // small helper to log to both console and on-page debug panel
  function dbg(...args) {
    const text = args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      try { return (typeof a === 'object') ? JSON.stringify(a) : String(a); } catch (e) { return String(a); }
    }).join(' ');
    console.log('[APP]', text);
    appendDebug(text);
  }
  function appendDebug(text) {
    const el = document.getElementById('debug');
    if (!el) return;
    const d = document.createElement('div');
    d.className = 'dbg-line';
    const ts = new Date().toLocaleTimeString();
    d.textContent = `[${ts}] ${text}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  // config
  const CHANNEL = () => document.getElementById('channel').value.trim().replace(/^#/, '');
  const BTTV_USER_ID = '56649026'; // quin69 Twitch user id from earlier
  const BTTV_USER_URL = `https://api.betterttv.net/3/cached/users/twitch/${BTTV_USER_ID}`;
  const BTTV_GLOBAL_URL = 'https://api.betterttv.net/3/cached/emotes/global';
  const FFZ_ROOM_URL = (chan) => `https://api.frankerfacez.com/v1/room/${chan}`;
  const STV_URL = (chan) => `https://7tv.io/v3/users/twitch/${BTTV_USER_ID}`;

  // DOM refs
  const statusEl = document.getElementById('status');
  const chatEl = document.getElementById('chat');
  const counterEl = document.getElementById('counter');
  const restartBtn = document.getElementById('restart');
  const clearDebugBtn = document.getElementById('clear-debug');
  const timeWindowSelect = document.getElementById('time-window');

  // state
  let socket = null;
  let emoteTimestamps = {}; // { emoteKey: [timestamp1, timestamp2, ...] }
  let emoteMeta = {};
  let bttvMap = {};
  let ffzMap = {};
  let stvMap = {};

  function logStatus(text) { statusEl.textContent = text; dbg(text); }

  function addChatLine(html) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = html;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function getTimeWindowMs() {
    const value = timeWindowSelect.value;
    if (value === 'all') return Infinity;
    return parseInt(value) * 1000; // convert seconds to milliseconds
  }

  function pruneOldTimestamps() {
    const windowMs = getTimeWindowMs();
    if (windowMs === Infinity) return;

    const now = Date.now();
    const cutoff = now - windowMs;

    for (const key in emoteTimestamps) {
      emoteTimestamps[key] = emoteTimestamps[key].filter(ts => ts > cutoff);
      if (emoteTimestamps[key].length === 0) {
        delete emoteTimestamps[key];
      }
    }
  }

  function getEmoteCounts() {
    pruneOldTimestamps();
    const counts = {};
    for (const key in emoteTimestamps) {
      counts[key] = emoteTimestamps[key].length;
    }
    return counts;
  }

  function updateCountersDisplay() {
    const emoteCounts = getEmoteCounts();
    const rows = Object.entries(emoteCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);
    counterEl.innerHTML = '';

    const windowText = timeWindowSelect.options[timeWindowSelect.selectedIndex].text;
    const headerDiv = document.createElement('div');
    headerDiv.className = 'small';
    headerDiv.style.marginBottom = '12px';
    headerDiv.textContent = `Showing emotes from: ${windowText}`;
    counterEl.appendChild(headerDiv);

    if (rows.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'small';
      emptyDiv.textContent = 'No emotes counted yet.';
      counterEl.appendChild(emptyDiv);
      return;
    }
    for (const [key, count] of rows) {
      const meta = emoteMeta[key] || {};
      const row = document.createElement('div');
      row.className = 'emote-row';
      const img = getCachedImage(meta.url || '', key, 'emote-img');
      img.onerror = () => { img.style.display = 'none'; };
      const spanCode = document.createElement('div');
      spanCode.innerHTML = `<span class="emote-code">${escapeHtml(key)}</span><div class="small">${meta.source || ''}</div>`;
      const spanCount = document.createElement('div');
      spanCount.className = 'count';
      spanCount.textContent = count;
      row.appendChild(img);
      row.appendChild(spanCode);
      row.appendChild(spanCount);
      counterEl.appendChild(row);
    }

    // Update animation with current emote counts
    if (typeof window.updateEmoteAnimation === 'function') {
      window.updateEmoteAnimation(emoteCounts, emoteMeta);
    }
  }

  function incrEmote(key, meta) {
    if (!key) return;
    if (!emoteTimestamps[key]) emoteTimestamps[key] = [];
    emoteTimestamps[key].push(Date.now());
    if (meta) emoteMeta[key] = Object.assign({}, emoteMeta[key] || {}, meta);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // fetch BTTV/FFZ lists (with logs)
  async function loadThirdPartyEmotes() {
    try {
      dbg('Fetching BTTV user emotes:', BTTV_USER_URL);
      const bUserResp = await fetch(BTTV_USER_URL);
      dbg('BTTV user fetch status:', bUserResp.status);
      if (bUserResp.ok) {
        const j = await bUserResp.json();
        dbg('BTTV user response keys:', Object.keys(j));
        const all = [];
        if (Array.isArray(j.channelEmotes)) all.push(...j.channelEmotes);
        if (Array.isArray(j.sharedEmotes)) all.push(...j.sharedEmotes);
        if (Array.isArray(j.emotes)) all.push(...j.emotes);
        dbg('BTTV user emote count found:', all.length);
        for (const e of all) {
          const id = e.id || e.code || e.name;
          const code = e.code || e.name;
          const url = `https://cdn.betterttv.net/emote/${id}/2x`;
          if (code) {
            bttvMap[code] = { id, url };
            const key = `${code}`;
            emoteMeta[key] = { source: 'bttv', url };
          }
        }
      } else {
        dbg('BTTV user fetch not ok, status', bUserResp.status);
      }
    } catch (err) {
      dbg('BTTV user fetch error:', err);
    }

    try {
      dbg('Fetching BTTV global emotes:', BTTV_GLOBAL_URL);
      const bGlobalResp = await fetch(BTTV_GLOBAL_URL);
      dbg('BTTV global status:', bGlobalResp.status);
      if (bGlobalResp.ok) {
        const g = await bGlobalResp.json();
        dbg('BTTV global count:', Array.isArray(g) ? g.length : 'unknown');
        if (Array.isArray(g)) {
          for (const e of g) {
            const id = e.id;
            const code = e.code;
            const url = `https://cdn.betterttv.net/emote/${id}/2x`;
            if (!bttvMap[code]) {
              bttvMap[code] = { id, url };
              const key = `${code}`;
              emoteMeta[key] = { source: 'bttv', url };
            }
          }
        }
      }
    } catch (err) {
      dbg('BTTV global fetch error:', err);
    }

    try {
      const chan = CHANNEL();
      dbg('Fetching FFZ room for channel:', chan);
      const ffzResp = await fetch(FFZ_ROOM_URL(chan));
      dbg('FFZ room status:', ffzResp.status);
      if (ffzResp.ok) {
        const j = await ffzResp.json();
        dbg('FFZ keys:', Object.keys(j));
        const sets = j.sets || {};
        let total = 0;
        for (const setId in sets) {
          const s = sets[setId];
          if (!s || !Array.isArray(s.emoticons)) continue;
          for (const emo of s.emoticons) {
            const code = emo.name;
            const urls = emo.urls || {};
            const pickKey = Object.keys(urls).sort((a, b) => Number(b) - Number(a))[0];
            const url = pickKey ? `${urls[pickKey]}` : null;
            ffzMap[code] = { id: emo.id, url };
            const key = `${code}`;
            emoteMeta[key] = { source: 'ffz', url };
            total++;
          }
        }
        if (Array.isArray(j.emoticons)) {
          for (const emo of j.emoticons) {
            const code = emo.name;
            const urls = emo.urls || {};
            const pickKey = Object.keys(urls).sort((a, b) => Number(b) - Number(a))[0];
            const url = pickKey ? `${urls[pickKey]}` : null;
            ffzMap[code] = { id: emo.id, url };
            const key = `${code}`;
            emoteMeta[key] = { source: 'ffz', url };
            total++;
          }
        }
        dbg('FFZ emoticon count loaded:', total);
      } else {
        dbg('FFZ fetch not ok (status):', ffzResp.status);
      }
    } catch (err) {
      dbg('FFZ fetch error:', err);
    }

    // Load 7TV emotes
    try {
      const chan = CHANNEL();
      dbg('Fetching 7TV user emotes:', STV_URL(chan));
      const stvResp = await fetch(STV_URL(chan));
      if (stvResp.ok) {
        const j = await stvResp.json();
        const jj = j.emote_set;
        (jj.emotes || []).forEach(e => {
          const code = e.name;
          const url = e.data?.host?.url ? e.data.host.url + '/2x.webp' : null;
          if (url) {
            stvMap[code] = { id: e.id, url };
            const key = `${code}`;
            emoteMeta[key] = { source: '7tv', url };
          }
        });
        dbg('7TV emotes loaded:', Object.keys(stvMap).length);
      } else dbg('7TV fetch failed status:', stvResp.status);
    } catch (err) { dbg('7TV fetch error:', err); }

    dbg('Finished loading third-party emotes. BTTV codes:', Object.keys(bttvMap).slice(0, 10), 'FFZ codes:', Object.keys(ffzMap).slice(0, 10), '7TV codes:', Object.keys(stvMap).slice(0, 10));
    logStatus('Emote lists loaded — connecting to chat...');
  }

  // basic IRCv3 tags parser (with logging)
  function parseIrcLine(line) {
    const result = { raw: line, tags: {}, prefix: null, command: null, params: [] };
    let rest = line;
    if (rest.startsWith('@')) {
      const i = rest.indexOf(' ');
      const tagsStr = rest.slice(1, i);
      rest = rest.slice(i + 1);
      const parts = tagsStr.split(';');
      for (const p of parts) {
        const [k, ...vparts] = p.split('=');
        const v = vparts.join('=') || '';
        const un = v.replace(/\\:/g, ';').replace(/\\s/g, ' ').replace(/\\\\/g, '\\').replace(/\\r/g, '\r').replace(/\\n/g, '\n');
        result.tags[k] = un;
      }
    }
    if (rest.startsWith(':')) {
      const i = rest.indexOf(' ');
      result.prefix = rest.slice(1, i);
      rest = rest.slice(i + 1);
    }
    const idx = rest.indexOf(' :');
    if (idx !== -1) {
      const pre = rest.slice(0, idx).trim();
      const trailing = rest.slice(idx + 2);
      const preParts = pre.split(/\s+/);
      result.command = preParts.shift();
      result.params = preParts.concat([trailing]);
    } else {
      const parts = rest.split(/\s+/);
      result.command = parts.shift();
      result.params = parts;
    }
    return result;
  }

  function connect() {
    const chan = CHANNEL();
    if (!chan) {
      logStatus('Enter a channel name.');
      return;
    }
    dbg('Starting connect() to channel:', chan);
    try { if (socket) socket.close(); } catch (e) { }
    socket = null;
    emoteTimestamps = {};
    updateCountersDisplay();
    chatEl.innerHTML = '';
    logStatus('Opening websocket to Twitch IRC…');

    try {
      socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (err) {
      dbg('WebSocket constructor error:', err);
      logStatus('WebSocket constructor error (see debug).');
      return;
    }

    socket.addEventListener('open', () => {
      dbg('WebSocket OPEN');
      // request tags/commands/membership
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      // anonymous login
      const anon = 'justinfan' + Math.floor(Math.random() * 100000);
      dbg('Using anonymous NICK:', anon);
      socket.send('PASS SCHMOOPIIE');
      socket.send('NICK ' + anon);
      socket.send('JOIN #' + chan);
      logStatus('Connected. Joined #' + chan);
    });

    socket.addEventListener('message', (ev) => {
      dbg('WS message raw length', (ev.data && ev.data.length) || 0);
      const data = ev.data;
      const lines = data.split(/\r\n/).filter(Boolean);
      dbg('WS message contained lines:', lines.length);
      for (const line of lines) {
        dbg('IRC line:', line);
        if (line.startsWith('PING')) {
          dbg('Responding to PING');
          socket.send(line.replace('PING', 'PONG'));
          continue;
        }
        const parsed = parseIrcLine(line);
        dbg('Parsed IRC:', parsed.command, parsed.tags && Object.keys(parsed.tags).slice(0, 5));
        if (parsed.command === 'PRIVMSG') {
          const channel = parsed.params[0];
          const message = parsed.params.slice(-1)[0] || '';
          const tags = parsed.tags || {};
          const displayName = tags['display-name'] || (parsed.prefix ? parsed.prefix.split('!')[0] : 'unknown');
          dbg('PRIVMSG from', displayName, 'message:', message);
          const container = document.createElement('span');

          processMessageForWordCloud(message);

          const nativeEmotes = {};
          if (tags.emotes) {
            const emTag = tags.emotes;
            if (emTag !== '') {
              const groups = emTag.split('/');
              for (const g of groups) {
                const [id, ranges] = g.split(':');
                if (!ranges) continue;
                const positions = ranges.split(',');
                for (const pos of positions) {
                  const [s, e] = pos.split('-').map(Number);
                  nativeEmotes[`${s}-${e}`] = id;
                }
              }
            }
          }

          if (Object.keys(nativeEmotes).length > 0) {
            const spans = [];
            let i = 0;
            const entries = Object.entries(nativeEmotes).map(([range, id]) => {
              const [s, e] = range.split('-').map(Number);
              return { s, e, id };
            }).sort((a, b) => a.s - b.s);
            for (const seg of entries) {
              if (i < seg.s) spans.push({ type: 'text', text: message.slice(i, seg.s) });
              spans.push({ type: 'native-emote', id: seg.id, text: message.slice(seg.s, seg.e + 1) });
              i = seg.e + 1;
            }
            if (i < message.length) spans.push({ type: 'text', text: message.slice(i) });
            for (const s of spans) {
              if (s.type === 'text') {
                const frag = renderTextWithThirdPartyEmotes(s.text);
                container.appendChild(frag);
              } else if (s.type === 'native-emote') {
                const url = `https://static-cdn.jtvnw.net/emoticons/v2/${s.id}/default/dark/2.0`;
                const img = getCachedImage(url, s.text, 'emote-img');
                container.appendChild(img);
                const key = `${s.text}`;
                incrEmote(key, { source: 'twitch', url });
                dbg('Counted native emote:', key);
              }
            }
          } else {
            const frag = renderTextWithThirdPartyEmotes(message);
            container.appendChild(frag);
          }

          const ts = new Date().toLocaleTimeString();
          addChatLine(`<div class="meta">${escapeHtml(displayName)} <span class="small">#${channel} • ${ts}</span></div>`);
          const wrapper = document.createElement('div');
          wrapper.className = 'msg';
          wrapper.appendChild(container);
          chatEl.appendChild(wrapper);
          chatEl.scrollTop = chatEl.scrollHeight;
          updateCountersDisplay();
        }

        // log other interesting commands
        if (parsed.command && parsed.command !== 'PRIVMSG' && parsed.command !== 'PONG') {
          dbg('IRC command seen:', parsed.command);
        }
      }
    });

    socket.addEventListener('close', (ev) => {
      dbg('WebSocket CLOSED code=' + ev.code + ' reason=' + ev.reason);
      logStatus('WebSocket closed. See debug for details.');
    });

    socket.addEventListener('error', (ev) => {
      dbg('WebSocket ERROR event:', ev);
      logStatus('WebSocket error (see debug).');
    });
  }

  // render text token by token; logs when it matches emotes
  function renderTextWithThirdPartyEmotes(text) {
    const frag = document.createDocumentFragment();
    const tokens = text.split(/(\s+)/);
    for (const tok of tokens) {
      if (tok.trim() === '') {
        frag.appendChild(document.createTextNode(tok));
        continue;
      }
      let matched = false;
      if (bttvMap[tok]) {
        const meta = bttvMap[tok];
        const img = getCachedImage(meta.url, tok, 'emote-img');
        frag.appendChild(img);
        const key = `${tok}`;
        incrEmote(key, { source: 'bttv', url: meta.url });
        dbg('Matched BTTV emote token:', tok);
        matched = true;
      }
      if (!matched && ffzMap[tok]) {
        const meta = ffzMap[tok];
        const img = getCachedImage(meta.url, tok, 'emote-img');
        frag.appendChild(img);
        const key = `${tok}`;
        incrEmote(key, { source: 'ffz', url: meta.url });
        dbg('Matched FFZ emote token:', tok);
        matched = true;
      }
      if (!matched && stvMap[tok]) {
        const meta = stvMap[tok];
        const img = getCachedImage(meta.url, tok, 'emote-img');
        frag.appendChild(img);
        const key = `${tok}`;
        incrEmote(key, { source: '7TV', url: meta.url });
        dbg('Matched 7TV emote token:', tok);
        matched = true;
      }
      if (!matched) {
        const cleaned = tok.replace(/^[^\w]+|[^\w]+$/g, '');
        if (cleaned !== tok) {
          if (bttvMap[cleaned]) {
            const meta = bttvMap[cleaned];
            const img = getCachedImage(meta.url, cleaned, 'emote-img');
            frag.appendChild(img);
            const key = `${cleaned}`;
            incrEmote(key, { source: 'bttv', url: meta.url });
            const trailing = tok.slice(tok.indexOf(cleaned) + cleaned.length);
            if (trailing) frag.appendChild(document.createTextNode(trailing));
            dbg('Matched BTTV with punctuation:', cleaned, 'orig token:', tok);
            matched = true;
          } else if (ffzMap[cleaned]) {
            const meta = ffzMap[cleaned];
            const img = getCachedImage(meta.url, cleaned, 'emote-img');
            frag.appendChild(img);
            const key = `${cleaned}`;
            incrEmote(key, { source: 'ffz', url: meta.url });
            const trailing = tok.slice(tok.indexOf(cleaned) + cleaned.length);
            if (trailing) frag.appendChild(document.createTextNode(trailing));
            dbg('Matched FFZ with punctuation:', cleaned, 'orig token:', tok);
            matched = true;
          } else if (stvMap[cleaned]) {
            const meta = stvMap[cleaned];
            const img = getCachedImage(meta.url, cleaned, 'emote-img');
            frag.appendChild(img);
            const key = `${cleaned}`;
            incrEmote(key, { source: '7TV', url: meta.url });
            const trailing = tok.slice(tok.indexOf(cleaned) + cleaned.length);
            if (trailing) frag.appendChild(document.createTextNode(trailing));
            dbg('Matched 7TV with punctuation:', cleaned, 'orig token:', tok);
            matched = true;
          }
        }
      }
      if (!matched) frag.appendChild(document.createTextNode(tok));
    }
    return frag;
  }

  // UI wiring
  restartBtn.addEventListener('click', () => {
    dbg('Restart button clicked. Reconnecting...');
    connect();
  });

  timeWindowSelect.addEventListener('change', () => {
    dbg('Time window changed to:', timeWindowSelect.value);
    updateCountersDisplay();
  });

  // initial
  dbg('Script start. Channel default:', CHANNEL());
  await loadThirdPartyEmotes();
  dbg('Now connecting to chat...');
  connect();

  // heartbeat debug so you know the script is alive
  setInterval(() => {
    const counts = getEmoteCounts();
    dbg('heartbeat — counts=' + Object.keys(counts).length);
    updateCountersDisplay();
    updateWordCloud();
  }, 15000);
  // also update counters frequently
  setInterval(updateCountersDisplay, 1000);
  setInterval(updateWordCloud, 500);

  // Simpler batch processing without time-based concerns
  let pendingWords = [];
  let wordCloudBatchTimeout = null;
  const WORDCLOUD_BATCH_DELAY = 3000;

  function processMessageForWordCloud(message) {
    const words = message.split(/\s+/);
    const nonEmoteWords = words.filter(word => {
      const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');

      if (cleanWord.length < 3 || STOP_WORDS.has(cleanWord) || cleanWord.includes("www") || cleanWord.includes("http")) return false;
      if (bttvMap[cleanWord] || ffzMap[cleanWord] || stvMap[cleanWord]) return false;
      if (bttvMap[word] || ffzMap[word] || stvMap[word]) return false;
      if (/^\d+$/.test(cleanWord)) return false;
      if (/^[^\w]+$/.test(cleanWord)) return false;

      return true;
    });

    pendingWords.push(...nonEmoteWords.map(word => ({
      word: word.toLowerCase().replace(/[^\w]/g, '')
    })));

    scheduleBatchWordCloudUpdate();
  }

  function scheduleBatchWordCloudUpdate() {
    if (wordCloudBatchTimeout) return; // Already scheduled

    wordCloudBatchTimeout = setTimeout(processWordCloudBatch, WORDCLOUD_BATCH_DELAY);
  }

  function processWordCloudBatch() {
    if (pendingWords.length === 0) return;

    const timestamp = Date.now();
    pendingWords.forEach(({ word }) => {
      if (word.length >= 3) {
        if (!wordTimestamps[word]) wordTimestamps[word] = [];
        wordTimestamps[word].push(timestamp); // Just add to the array
      }
    });

    pendingWords = [];
    wordCloudBatchTimeout = null;

    updateWordCloud();
  }

  // Add this function to update the word cloud display
  function updateWordCloud() {
    const wordCounts = getWordCountsWithDecay();

    const wordcloudEl = document.getElementById('wordcloud');
    if (!wordcloudEl) return;

    wordcloudEl.innerHTML = '';

    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50);

    if (topWords.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'small';
      emptyMsg.textContent = 'No words to display yet.';
      emptyMsg.style.color = '#777';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.width = '100%';
      emptyMsg.style.padding = '20px';
      wordcloudEl.appendChild(emptyMsg);
      return;
    }

    const maxCount = Math.max(...topWords.map(([_, count]) => count));

    topWords.forEach(([word, count]) => {
      const wordEl = document.createElement('span');
      wordEl.className = 'word-cloud-word';

      const sizeLevel = Math.min(7, Math.max(1, Math.ceil((count / maxCount) * 7)));
      wordEl.classList.add(`word-size-${sizeLevel}`);

      wordEl.textContent = word;
      wordEl.title = `Used ${count} times total`;

      wordEl.addEventListener('click', () => {
        filterChatByWord(word);
      });

      wordcloudEl.appendChild(wordEl);
    });
  }

  function getWordCountsWithDecay() {
    const windowMs = getTimeWindowMs();
    const now = Date.now();
    const counts = {};

    for (const word in wordTimestamps) {
      const timestamps = wordTimestamps[word];

      if (windowMs === Infinity) {
        // All time - simple count
        counts[word] = timestamps.length;
      } else {
        // Weight recent usage more heavily
        let weightedCount = 0;
        timestamps.forEach(ts => {
          const age = now - ts;
          if (age <= windowMs) {
            // Linear decay: newer = higher weight
            const weight = 1 - (age / windowMs);
            weightedCount += weight;
          }
          // Older timestamps contribute 0
        });
        counts[word] = Math.round(weightedCount * 10) / 10; // Keep decimal for smoothness
      }
    }
    return counts;
  }

  function filterChatByWord(word) {
    // Simple implementation: highlight messages containing the word
    const messages = document.querySelectorAll('#chat .msg');
    messages.forEach(msg => {
      const text = msg.textContent.toLowerCase();
      if (text.includes(word.toLowerCase())) {
        msg.style.backgroundColor = 'rgba(145, 71, 255, 0.2)';
        msg.style.border = '1px solid #9147ff';
        setTimeout(() => {
          msg.style.backgroundColor = '';
          msg.style.border = '';
        }, 3000);
      }
    });

    dbg(`Highlighted messages containing: ${word}`);
  }


})();