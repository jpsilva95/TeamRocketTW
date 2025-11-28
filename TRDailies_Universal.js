// ==UserScript==
// @name         Mystery Inc. Dailies (Fixed Version)
// @namespace    http://tampermonkey.net/
// @version      4.9.4
// @description  Send daily farm, resource stats, and troop counts to Discord (Hides 0 troop counts) - fixed scheduler locks, 1 send/minute globally
// @author       Mystery Inc.
// @match        https://*.tribalwars.com.pt/game.php*
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.com/game.php*
// @match        https://*.tribalwars.co.uk/game.php*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// ==/UserScript==

(function() {
    'use strict';

    // Runtime detection
    const IS_TAMPERMONKEY = (typeof GM_info !== 'undefined') || (typeof GM_xmlhttpRequest !== 'undefined');

    // Bookmarklet reinjection guard: only active when NOT Tampermonkey
    if (!IS_TAMPERMONKEY) {
        if (window.__twDailyBookmarkletLoaded) {
            console.log('Mystery Inc: Bookmarklet already active — aborting reinjection.');
            return;
        }
        window.__twDailyBookmarkletLoaded = true;
    }

    // Page-level scheduler object (used for bookmarklet; harmless in TM)
    window.__twDailyScheduler = window.__twDailyScheduler || {
        timeoutId: null,
        intervalId: null,
        active: false,
        inProgress: false
    };

    const CONFIG = {
        ver: '4.9.4',
        keys: {
            version: 'tw_script_version',
            webhook: 'tw_discord_webhook',
            autoEnabled: 'tw_auto_send_enabled',
            autoTime: 'tw_auto_send_time',
            // new global per-minute lock
            minuteLock: 'tw_send_minute_lock'
        },
        // legacy keys (kept here only for backwards cleanup)
        legacyKeys: {
            lastAutoDate: 'tw_last_auto_send',
            sentMarker: 'tw_daily_sent_marker',
            sendingMarker: 'tw_daily_sending_marker',
            intentMarker: 'tw_daily_intent_marker'
        },
        icons: {
            button: 'https://i.ibb.co/x8JQX8yS/ex1.png',
            units: 'https://dspt.innogamescdn.com/asset/caf5a096/graphic/unit/'
        },
        unitNames: {
            'spear': 'Spear', 'sword': 'Sword', 'axe': 'Axe', 'archer': 'Archer',
            'spy': 'Spy', 'light': 'Light Cav', 'marcher': 'Mounted Archer',
            'heavy': 'Heavy Cav', 'ram': 'Ram', 'catapult': 'Catapult',
            'knight': 'Paladin', 'snob': 'Noble'
        }
    };

    class TwDailyStats {
        constructor() {
            this.checkVersion();
            this.initUI();
            this.initAutoScheduler();
        }

        checkVersion() {
            const lastVer = localStorage.getItem(CONFIG.keys.version);
            if (lastVer !== CONFIG.ver) {
                console.log(`New script version: ${CONFIG.ver} (was: ${lastVer})`);
                localStorage.setItem(CONFIG.keys.version, CONFIG.ver);
                // Clear legacy markers to avoid interference from older versions
                try {
                    localStorage.removeItem(CONFIG.legacyKeys.sentMarker);
                    localStorage.removeItem(CONFIG.legacyKeys.sendingMarker);
                    localStorage.removeItem(CONFIG.legacyKeys.intentMarker);
                    localStorage.removeItem(CONFIG.legacyKeys.lastAutoDate);
                } catch (e) {
                    // ignore
                }
            }
        }

        // --- UI GENERATION ---

        initUI() {
            if (document.getElementById('trDailiesBtn')) return;

            const questLog = document.querySelector('.questlog, #questlog_new, [id*="questlog"]');
            if (questLog) {
                const container = document.createElement('div');
                container.style.cssText = 'margin-top: 5px; text-align: center;';
                
                const btn = document.createElement('button');
                btn.id = 'trDailiesBtn';
                btn.innerHTML = `<img src="${CONFIG.icons.button}" style="width: 45px; height: 45px;">`;
                btn.title = 'Daily Stats to Discord';
                btn.style.cssText = 'width: 40px; height: 40px; background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;';
                btn.onclick = (e) => { e.preventDefault(); this.openSettingsModal(); };
                
                container.appendChild(btn);
                questLog.appendChild(container);
            } else {
                const headerInfo = document.querySelector('#header_info');
                if (headerInfo) {
                    const link = document.createElement('a');
                    link.id = 'trDailiesBtn';
                    link.href = '#';
                    link.innerHTML = `<img src="${CONFIG.icons.button}" style="width: 20px; height: 20px; vertical-align: middle;">`;
                    link.title = 'Daily Stats';
                    link.style.cssText = 'margin-left: 10px; padding: 5px; background: transparent; border: none; text-decoration: none; display: inline-block;';
                    link.onclick = (e) => { e.preventDefault(); this.openSettingsModal(); };
                    headerInfo.appendChild(link);
                }
            }
        }

        openSettingsModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';

            const modal = document.createElement('div');
            modal.style.cssText = 'background: #2C2F33; color: #DCDDDE; padding: 25px; border-radius: 8px; width: 550px; box-shadow: 0 8px 16px rgba(0,0,0,0.3); font-family: Arial, sans-serif;';

            modal.innerHTML = `
                <h2 style="margin-top: 0; color: #5865F2;">📊 Send Daily Stats to Discord</h2>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Discord Webhook URL:</label>
                    <input type="text" id="webhookUrl" placeholder="https://discord.com/api/webhooks/..." style="width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px;">
                        <input type="checkbox" id="autoSendEnabled" style="margin-right: 5px;"><strong>Auto-send daily at:</strong>
                    </label>
                    <input type="time" id="autoSendTime" value="23:00" disabled style="width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;">
                    <p style="font-size: 12px; color: #B9BBBE; margin: 5px 0 0 0;">Leave the game open for auto-send to work</p>
                </div>
                <div id="statsPreview" style="background: #40444B; padding: 15px; border-radius: 4px; margin-bottom: 15px;">
                    <p style="margin: 5px 0;"><strong>Gathering stats...</strong></p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="sendBtn" style="flex: 1; padding: 10px; background: #5865F2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">Send to Discord</button>
                    <button id="closeBtn" style="flex: 1; padding: 10px; background: #ED4245; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">Close</button>
                </div>
                <div id="statusMsg" style="margin-top: 15px; text-align: center; font-size: 14px;"></div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this.setupModalLogic(overlay);
        }

        setupModalLogic(overlay) {
            const webhookInput = document.getElementById('webhookUrl');
            const autoCheck = document.getElementById('autoSendEnabled');
            const autoTime = document.getElementById('autoSendTime');
            const preview = document.getElementById('statsPreview');
            const sendBtn = document.getElementById('sendBtn');
            const closeBtn = document.getElementById('closeBtn');

            webhookInput.value = localStorage.getItem(CONFIG.keys.webhook) || '';
            autoCheck.checked = localStorage.getItem(CONFIG.keys.autoEnabled) === 'true';
            autoTime.value = localStorage.getItem(CONFIG.keys.autoTime) || '23:00';
            autoTime.disabled = !autoCheck.checked;

            autoCheck.onchange = () => {
                autoTime.disabled = !autoCheck.checked;
                localStorage.setItem(CONFIG.keys.autoEnabled, autoCheck.checked);
                if (autoCheck.checked) {
                    localStorage.setItem(CONFIG.keys.autoTime, autoTime.value);
                    this.initAutoScheduler();
                } else {
                    // if disabling, clear page-level scheduler (safe on both TM and bookmarklet)
                    this.clearPageScheduler();
                }
            };

            autoTime.onchange = () => {
                localStorage.setItem(CONFIG.keys.autoTime, autoTime.value);
                if (autoCheck.checked) this.initAutoScheduler();
            };

            closeBtn.onclick = () => document.body.removeChild(overlay);
            overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

            this.gatherStats().then(stats => {
                this.renderPreview(stats, preview);
            }).catch(err => {
                preview.innerHTML = '<p style="margin: 5px 0; color: #ED4245;"><strong>Error loading stats.</strong></p>';
                console.error(err);
            });

            sendBtn.onclick = async () => {
                const url = webhookInput.value.trim();
                const statusMsg = document.getElementById('statusMsg');
                
                if (!url) {
                    statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Please enter a webhook URL</span>';
                    return;
                }
                
                sendBtn.disabled = true;
                sendBtn.style.opacity = '0.5';
                localStorage.setItem(CONFIG.keys.webhook, url);
                statusMsg.innerHTML = '<span style="color: #FEE75C;">⏳ Sending...</span>';

                try {
                    const stats = await this.gatherStats();
                    const manualName = document.getElementById('manualPlayerName');
                    if (manualName && manualName.value.trim()) {
                        stats.playerName = manualName.value.trim();
                        const hookId = url.split('/').pop();
                        localStorage.setItem(`tw_player_name_${stats.world}_${hookId}`, stats.playerName);
                    }

                    await this.sendToDiscord(url, stats, statusMsg);
                } catch (e) {
                    statusMsg.innerHTML = `<span style="color: #ED4245;">❌ Error: ${e.message}</span>`;
                } finally {
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = '1';
                }
            };
        }

        renderPreview(stats, container) {
            const generateTroopHtml = (troopData, title) => {
                let html = '';
                let hasTroops = false;
                
                for (const [unit, data] of Object.entries(troopData)) {
                    const countNum = this.parseNumber(data.count);
                    if (countNum <= 0) continue;

                    if (!hasTroops) {
                        html += `<p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>${title}</strong></p>`;
                        hasTroops = true;
                    }
                    html += `<p style="margin: 2px 0; padding-left: 20px; font-size: 13px;"><img src="${data.icon}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 4px;"> ${unit}: ${data.count}</p>`;
                }
                return html;
            };

            const troopsHomeHtml = generateTroopHtml(stats.troopsHome, '⚔️ Total Troops at Home:');
            const troopsScavHtml = generateTroopHtml(stats.troopsScavenging, '🔍 Total Troops Scavenging:');

            let nameInput = '';
            if (stats.playerName === 'Unknown') {
                nameInput = `<div style="margin: 10px 0; padding: 10px; background: #ED4245; border-radius: 4px;"><p style="margin: 0 0 5px 0; font-size: 12px; color: white;"><strong>⚠️ Player name not detected</strong></p><input type="text" id="manualPlayerName" placeholder="Enter your player name" style="width: 100%; padding: 6px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box; font-size: 13px;"></div>`;
            }

            container.innerHTML = `
                <p style="margin: 5px 0;"><strong>🌍 World:</strong> ${stats.world}</p>
                <p style="margin: 5px 0;"><strong>👤 Player:</strong> ${stats.playerName}</p>
                ${nameInput}
                <p style="margin: 5px 0;"><strong>🌾 Daily Farm Total:</strong> ${stats.farmTotal}</p>
                <p style="margin: 5px 0;"><strong>📦 Daily Resources Total:</strong> ${stats.gatherTotal}</p>
                <p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>💰 Grand Total:</strong> ${stats.grandTotal}</p>
                ${troopsHomeHtml}
                ${troopsScavHtml}
            `;
        }

        // --- DATA GATHERING ---

        async gatherStats() {
            const stats = {
                farmResources: { wood: 'N/A', clay: 'N/A', iron: 'N/A' },
                gatherResources: { wood: 'N/A', clay: 'N/A', iron: 'N/A' },
                farmTotal: 'N/A', gatherTotal: 'N/A', grandTotal: 'N/A',
                playerName: 'Unknown',
                troopsHome: {},
                troopsScavenging: {},
                world: 'Unknown'
            };

            const baseUrl = window.location.origin + window.location.pathname;
            const search = new URLSearchParams(window.location.search);
            const worldMatch = window.location.hostname.match(/^(\w+)\./);
            stats.world = worldMatch ? worldMatch[1].toUpperCase() : 'Unknown';

            await this.fetchPlayerName(baseUrl, search, stats);
            await this.fetchLootStats(baseUrl, search, stats);
            await this.fetchScavengeStats(baseUrl, search, stats);

            if (stats.gatherTotal !== 'N/A' && stats.farmTotal !== 'N/A') {
                const gather = this.parseNumber(stats.gatherTotal);
                const farm = this.parseNumber(stats.farmTotal);
                stats.grandTotal = this.formatNumber(gather + farm);
            }

            await this.fetchTroopCounts(baseUrl, search, stats);
            return stats;
        }

        async fetchPlayerName(baseUrl, search, stats) {
            try {
                if (typeof game_data !== 'undefined' && game_data.player && game_data.player.name) {
                    stats.playerName = game_data.player.name;
                    return;
                }
                const response = await fetch(`${baseUrl}?${search.toString()}&screen=info_player`);
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const selectors = [
                    'td.selected a[href*="screen=info_player"]',
                    'table.vis.modemenu td.selected a',
                    '#menu_row2 a[href*="screen=info_player"]:not([href*="id="])'
                ];
                for (let sel of selectors) {
                    const el = doc.querySelector(sel);
                    if (el) { stats.playerName = el.textContent.trim(); break; }
                }
            } catch (e) { console.error("Error fetching player name", e); }
        }

        async fetchLootStats(baseUrl, search, stats) {
            try {
                const res = await fetch(`${baseUrl}?${search.toString()}&screen=ranking&mode=in_a_day&type=loot_res`);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const content = doc.querySelector('#content_value');
                if (content) {
                    const match = content.textContent.match(/O\s+meu\s+resultado\s+de\s+hoje:\s*([\d\s\.]+)/i);
                    if (match) stats.farmTotal = this.formatNumber(this.parseNumber(match[1]));
                }
            } catch (e) { console.error(e); }
        }

        async fetchScavengeStats(baseUrl, search, stats) {
            try {
                const res = await fetch(`${baseUrl}?${search.toString()}&screen=ranking&mode=in_a_day&type=scavenge`);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const content = doc.querySelector('#content_value');
                if (content) {
                    const match = content.textContent.match(/O\s+meu\s+resultado\s+de\s+hoje:\s*([\d\s\.]+)/i);
                    if (match) stats.gatherTotal = this.formatNumber(this.parseNumber(match[1]));
                }
            } catch (e) { console.error(e); }
        }

        async fetchTroopCounts(baseUrl, search, stats) {
            let page = 0;
            let done = false;
            while (!done && page < 20) {
                const url = `${baseUrl}?${search.toString()}&screen=place&mode=scavenge_mass&page=${page}`;
                const res = await fetch(url);
                const text = await res.text();
                const match = text.match(/ScavengeMassScreen[\s\S]*?(,\n *\[.*?\}{0,3}\],\n)/);
                
                if (!match || match.length <= 1) { done = true; break; }
                
                let jsonStr = match[1];
                jsonStr = jsonStr.substring(jsonStr.indexOf('['));
                jsonStr = jsonStr.substring(0, jsonStr.length - 2);

                try {
                    const villages = JSON.parse(jsonStr);
                    if (villages.length === 0) { done = true; break; }

                    villages.forEach(v => {
                        if (stats.playerName === 'Unknown' && v.player_name) stats.playerName = v.player_name;
                        if (v.unit_counts_home) {
                            for (const [unit, count] of Object.entries(v.unit_counts_home)) this.addTroopCount(stats.troopsHome, unit, count);
                        }
                        if (v.options) {
                            Object.values(v.options).forEach(opt => {
                                if (opt.scavenging_squad && opt.scavenging_squad.unit_counts) {
                                    for (const [unit, count] of Object.entries(opt.scavenging_squad.unit_counts)) this.addTroopCount(stats.troopsScavenging, unit, count);
                                }
                            });
                        }
                    });
                } catch (jsonErr) { console.error("JSON Parse error on page " + page, jsonErr); }
                page++;
                await new Promise(r => setTimeout(r, 200));
            }
            for (let key in stats.troopsHome) stats.troopsHome[key].count = this.formatNumber(stats.troopsHome[key].count);
            for (let key in stats.troopsScavenging) stats.troopsScavenging[key].count = this.formatNumber(stats.troopsScavenging[key].count);
        }

        addTroopCount(storage, unitCode, count) {
            if (unitCode === 'militia') return;
            const name = CONFIG.unitNames[unitCode];
            if (!name) return;
            if (!storage[name]) storage[name] = { count: 0, icon: `${CONFIG.icons.units}unit_${unitCode}.png` };
            storage[name].count += parseInt(count) || 0;
        }

        // --- DISCORD SENDING ---


        // Helper: returns current minute key: "YYYY-MM-DDTHH:MM"
        getCurrentMinuteKey() {
            const d = new Date();
            d.setSeconds(0, 0);
            return d.toISOString().slice(0, 16);
        }

        // Attempt to claim the current minute. Returns true if this tab won the minute.
        async attemptMinuteLock() {
            const minute = this.getCurrentMinuteKey();
            const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const payload = { minute, tabId, ts: Date.now() };
            try {
                localStorage.setItem(CONFIG.keys.minuteLock, JSON.stringify(payload));
            } catch (e) {
                // localStorage write could fail rarely (e.g. quota), treat as loss
                return false;
            }

            // Small randomized delay so racing tabs can write and we can verify winner.
            await new Promise(r => setTimeout(r, Math.random() * 300 + 100));

            try {
                const current = JSON.parse(localStorage.getItem(CONFIG.keys.minuteLock) || '{}');
                return current && current.minute === minute && current.tabId === tabId;
            } catch {
                return false;
            }
        }

        async sendToDiscord(webhookUrl, stats, statusElement) {
            // GLOBAL: enforce 1 send per minute across all tabs/pages
            const wonMinute = await this.attemptMinuteLock();
            if (!wonMinute) {
                if (statusElement) {
                    statusElement.innerHTML = '<span style="color: #ED4245;">⏳ A send already occurred this minute</span>';
                }
                throw new Error('Send already occurred this minute');
            }

            // Only apply page-level inProgress guard for bookmarklet (NOT in Tampermonkey)
            if (!IS_TAMPERMONKEY) {
                if (window.__twDailyScheduler.inProgress) {
                    if (statusElement) statusElement.innerHTML = '<span style="color: #ED4245;">❌ Send already in progress on this page</span>';
                    throw new Error('Send already in progress on this page');
                }
                window.__twDailyScheduler.inProgress = true;
            }

            const fields = [
                { name: 'Player', value: '👤 ' + (stats.playerName || 'Unknown'), inline: false },
                { name: 'World', value: '🌍 ' + (stats.world || 'Unknown'), inline: false },
                { name: 'Daily Farm Total', value: '🌾 ' + (stats.farmTotal || '0'), inline: true },
                { name: 'Daily Resources Total', value: '📦 ' + (stats.gatherTotal || '0'), inline: true },
                { name: 'Grand Total', value: '💰 ' + (stats.grandTotal || '0'), inline: false }
            ];

            const formatTroopString = (troopObj) => {
                let str = '';
                for (const [name, data] of Object.entries(troopObj)) {
                    const numericCount = this.parseNumber(data.count);
                    if (numericCount > 0) {
                        str += `${name}: ${data.count}\n`;
                    }
                }
                return str.trim();
            };

            const homeStr = formatTroopString(stats.troopsHome);
            if (homeStr.length > 0 && homeStr.length < 1024) fields.push({ name: '⚔️ Troops at Home', value: homeStr, inline: false });

            const scavStr = formatTroopString(stats.troopsScavenging);
            if (scavStr.length > 0 && scavStr.length < 1024) fields.push({ name: '🔍 Troops Scavenging', value: scavStr, inline: false });

            const payload = JSON.stringify({
                embeds: [{
                    title: '📊 Tribal Wars Daily Report',
                    color: 5814783,
                    fields: fields,
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Mystery Inc Bot' }
                }]
            });

            const finalize = (success) => {
                // Only clear page-level flag for bookmarklet
                if (!IS_TAMPERMONKEY) window.__twDailyScheduler.inProgress = false;
                if (success && statusElement) statusElement.innerHTML = '<span style="color: #57F287;">✅ Successfully sent to Discord!</span>';
            };

            return new Promise((resolve, reject) => {
                const handleSuccess = () => { finalize(true); resolve(); };
                const handleError = (msg) => { finalize(false); if (statusElement) statusElement.innerHTML = `<span style="color: #ED4245;">❌ ${msg}</span>`; reject(new Error(msg)); };

                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: webhookUrl,
                        headers: { 'Content-Type': 'application/json' },
                        data: payload,
                        onload: (res) => { if (res.status >= 200 && res.status < 300) handleSuccess(); else handleError(`Status ${res.status}: ${res.responseText}`); },
                        onerror: () => handleError('Network Error')
                    });
                } else {
                    fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
                    .then((res) => {
                        if (!res.ok) {
                            return res.text().then(t => { handleError(`Status ${res.status}: ${t}`); });
                        }
                        handleSuccess();
                    })
                    .catch(e => handleError(e.message));
                }
            });
        }

        // --- UTILS ---

        parseNumber(str) {
            if (!str) return 0;
            if (typeof str === 'number') return str;
            return parseInt(str.replace(/\s/g, '').replace(/\./g, '').replace(/[^\d]/g, '')) || 0;
        }

        formatNumber(num) {
            return num.toLocaleString('pt-PT');
        }

        // --- AUTO SCHEDULER ---

        clearPageScheduler() {
            try {
                if (window.__twDailyScheduler.timeoutId) {
                    clearTimeout(window.__twDailyScheduler.timeoutId);
                    window.__twDailyScheduler.timeoutId = null;
                }
                if (window.__twDailyScheduler.intervalId) {
                    clearInterval(window.__twDailyScheduler.intervalId);
                    window.__twDailyScheduler.intervalId = null;
                }
                window.__twDailyScheduler.active = false;
            } catch (e) {
                console.error('Error clearing page scheduler', e);
            }
        }

        initAutoScheduler() {
            const enabled = localStorage.getItem(CONFIG.keys.autoEnabled) === 'true';
            const time = localStorage.getItem(CONFIG.keys.autoTime) || '23:00';
            const webhook = localStorage.getItem(CONFIG.keys.webhook);

            if (!enabled || !webhook) {
                this.clearPageScheduler();
                return;
            }

            // Bookmarklet-only scheduler guard
            if (!IS_TAMPERMONKEY) {
                if (window.__twDailyScheduler.active) {
                    console.log('Bookmarklet: scheduler already active - skipping init.');
                    return;
                }
            }

            // clear any previous timers, safe in both environments
            this.clearPageScheduler();

            const now = new Date();
            const delay = (60 - now.getSeconds()) * 1000;

            window.__twDailyScheduler.timeoutId = setTimeout(() => {
                this.checkAutoSend(time, webhook);
                window.__twDailyScheduler.intervalId = setInterval(() => this.checkAutoSend(time, webhook), 60000);
            }, delay);

            window.__twDailyScheduler.active = true;
            console.log('Auto scheduler initialized (active:', window.__twDailyScheduler.active, ')');
        }

        async checkAutoSend(targetTime, webhook) {
            try {
                const now = new Date();

                // Parse target time
                const [th, tm] = (targetTime || '23:00').split(':').map(v => parseInt(v, 10));
                const target = new Date(now);
                target.setHours(th, tm, 0, 0);

                // Only continue if within 0..59999 ms of target minute
                const deltaMs = now - target;
                if (deltaMs < 0 || deltaMs >= 60000) return;

                // With the per-minute lock in sendToDiscord we don't need cross-tab intent negotiation.
                // Just gather stats and attempt to send; sendToDiscord will enforce 1-send-per-minute globally.
                const stats = await this.gatherStats();
                const hookId = webhook.split('/').pop();
                const savedName = localStorage.getItem(`tw_player_name_${stats.world}_${hookId}`);
                if (savedName) stats.playerName = savedName;

                await this.sendToDiscord(webhook, stats, null);

                console.log('Auto-send attempt finished for', target.toString());
            } catch (e) {
                console.error('checkAutoSend error', e);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new TwDailyStats());
    } else {
        new TwDailyStats();
    }

})();
