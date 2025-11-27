// ==UserScript==
// @name         Mystery Inc. Dailies (Clean Version)
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Send daily farm, resource stats, and troop counts to Discord (De-obfuscated & Improved)
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

    const CONFIG = {
        ver: '4.0',
        keys: {
            version: 'tw_script_version',
            webhook: 'tw_discord_webhook',
            autoEnabled: 'tw_auto_send_enabled',
            autoTime: 'tw_auto_send_time',
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
                // Clear locks on update
                localStorage.removeItem(CONFIG.keys.sentMarker);
                localStorage.removeItem(CONFIG.keys.sendingMarker);
                localStorage.removeItem(CONFIG.keys.intentMarker);
            }
        }

        // --- UI GENERATION ---

        initUI() {
            if (document.getElementById('trDailiesBtn')) return;

            // Try to find the Questlog (preferred spot)
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
                // Fallback to header info
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

            // Modal HTML
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

            // Logic for Modal Inputs
            this.setupModalLogic(overlay);
        }

        setupModalLogic(overlay) {
            const webhookInput = document.getElementById('webhookUrl');
            const autoCheck = document.getElementById('autoSendEnabled');
            const autoTime = document.getElementById('autoSendTime');
            const preview = document.getElementById('statsPreview');
            const sendBtn = document.getElementById('sendBtn');
            const closeBtn = document.getElementById('closeBtn');

            // Load saved settings
            webhookInput.value = localStorage.getItem(CONFIG.keys.webhook) || '';
            autoCheck.checked = localStorage.getItem(CONFIG.keys.autoEnabled) === 'true';
            autoTime.value = localStorage.getItem(CONFIG.keys.autoTime) || '23:00';
            autoTime.disabled = !autoCheck.checked;

            // Event Listeners
            autoCheck.onchange = () => {
                autoTime.disabled = !autoCheck.checked;
                localStorage.setItem(CONFIG.keys.autoEnabled, autoCheck.checked);
                if (autoCheck.checked) {
                    localStorage.setItem(CONFIG.keys.autoTime, autoTime.value);
                    this.initAutoScheduler();
                }
            };

            autoTime.onchange = () => {
                localStorage.setItem(CONFIG.keys.autoTime, autoTime.value);
                if (autoCheck.checked) this.initAutoScheduler();
            };

            closeBtn.onclick = () => document.body.removeChild(overlay);
            overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

            // Load Preview
            this.gatherStats().then(stats => {
                this.renderPreview(stats, preview);
            }).catch(err => {
                preview.innerHTML = '<p style="margin: 5px 0; color: #ED4245;"><strong>Error loading stats.</strong></p>';
                console.error(err);
            });

            // Send Button
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
                    // Check for manual name override
                    const manualName = document.getElementById('manualPlayerName');
                    if (manualName && manualName.value.trim()) {
                        stats.playerName = manualName.value.trim();
                        // Save name for this specific webhook
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
            let troopsHomeHtml = '';
            if (Object.keys(stats.troopsHome).length > 0) {
                troopsHomeHtml = '<p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>⚔️ Total Troops at Home:</strong></p>';
                for (const [unit, data] of Object.entries(stats.troopsHome)) {
                    if (data.count === 0) continue;
                    troopsHomeHtml += `<p style="margin: 2px 0; padding-left: 20px; font-size: 13px;"><img src="${data.icon}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 4px;"> ${unit}: ${data.count}</p>`;
                }
            }

            let troopsScavHtml = '';
            if (Object.keys(stats.troopsScavenging).length > 0) {
                troopsScavHtml = '<p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>🔍 Total Troops Scavenging:</strong></p>';
                for (const [unit, data] of Object.entries(stats.troopsScavenging)) {
                    if (data.count === 0) continue;
                    troopsScavHtml += `<p style="margin: 2px 0; padding-left: 20px; font-size: 13px;"><img src="${data.icon}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 4px;"> ${unit}: ${data.count}</p>`;
                }
            }

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

            // 1. Fetch Player Name
            await this.fetchPlayerName(baseUrl, search, stats);

            // 2. Fetch Loot (Farm) Stats
            await this.fetchLootStats(baseUrl, search, stats);

            // 3. Fetch Scavenge Stats
            await this.fetchScavengeStats(baseUrl, search, stats);

            // Calculate Grand Total
            if (stats.gatherTotal !== 'N/A' && stats.farmTotal !== 'N/A') {
                const gather = this.parseNumber(stats.gatherTotal);
                const farm = this.parseNumber(stats.farmTotal);
                stats.grandTotal = this.formatNumber(gather + farm);
            }

            // 4. Fetch Troop Counts (Scavenging Pages)
            await this.fetchTroopCounts(baseUrl, search, stats);

            return stats;
        }

        async fetchPlayerName(baseUrl, search, stats) {
            try {
                // Try getting it from game_data global first
                if (typeof game_data !== 'undefined' && game_data.player && game_data.player.name) {
                    stats.playerName = game_data.player.name;
                    return;
                }

                const response = await fetch(`${baseUrl}?${search.toString()}&screen=info_player`);
                const html = await response.text();
                const doc = new DOMParser().parseFromString(html, 'text/html');
                
                // Try multiple selectors
                const selectors = [
                    'td.selected a[href*="screen=info_player"]',
                    'table.vis.modemenu td.selected a',
                    '#menu_row2 a[href*="screen=info_player"]:not([href*="id="])'
                ];

                for (let sel of selectors) {
                    const el = doc.querySelector(sel);
                    if (el) {
                        stats.playerName = el.textContent.trim();
                        break;
                    }
                }
            } catch (e) {
                console.error("Error fetching player name", e);
            }
        }

        async fetchLootStats(baseUrl, search, stats) {
            try {
                const res = await fetch(`${baseUrl}?${search.toString()}&screen=ranking&mode=in_a_day&type=loot_res`);
                const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                const content = doc.querySelector('#content_value');
                
                if (content) {
                    const match = content.textContent.match(/O\s+meu\s+resultado\s+de\s+hoje:\s*([\d\s\.]+)/i); // Portuguese regex match
                    if (match) stats.farmTotal = this.formatNumber(this.parseNumber(match[1]));
                    
                    // Detail extraction could go here if needed
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
            
            // Safety limit 20 pages
            while (!done && page < 20) {
                const url = `${baseUrl}?${search.toString()}&screen=place&mode=scavenge_mass&page=${page}`;
                const res = await fetch(url);
                const text = await res.text();
                
                // Regex to find the JSON data in the JS on the page
                const match = text.match(/ScavengeMassScreen[\s\S]*?(,\n *\[.*?\}{0,3}\],\n)/);
                
                if (!match || match.length <= 1) {
                    done = true; 
                    break;
                }

                // Clean up the JSON string to make it parseable
                let jsonStr = match[1];
                jsonStr = jsonStr.substring(jsonStr.indexOf('['));
                jsonStr = jsonStr.substring(0, jsonStr.length - 2);

                try {
                    const villages = JSON.parse(jsonStr);
                    if (villages.length === 0) {
                        done = true;
                        break;
                    }

                    // Process villages
                    villages.forEach(v => {
                        // Backup name detection
                        if (stats.playerName === 'Unknown' && v.player_name) stats.playerName = v.player_name;

                        // Count Home Troops
                        if (v.unit_counts_home) {
                            for (const [unit, count] of Object.entries(v.unit_counts_home)) {
                                this.addTroopCount(stats.troopsHome, unit, count);
                            }
                        }

                        // Count Scavenging Troops
                        if (v.options) {
                            Object.values(v.options).forEach(opt => {
                                if (opt.scavenging_squad && opt.scavenging_squad.unit_counts) {
                                    for (const [unit, count] of Object.entries(opt.scavenging_squad.unit_counts)) {
                                        this.addTroopCount(stats.troopsScavenging, unit, count);
                                    }
                                }
                            });
                        }
                    });

                } catch (jsonErr) {
                    console.error("JSON Parse error on page " + page, jsonErr);
                }

                page++;
                // Small delay to be polite to server
                await new Promise(r => setTimeout(r, 200));
            }

            // Format numbers at the end
            for (let key in stats.troopsHome) stats.troopsHome[key].count = this.formatNumber(stats.troopsHome[key].count);
            for (let key in stats.troopsScavenging) stats.troopsScavenging[key].count = this.formatNumber(stats.troopsScavenging[key].count);
        }

        addTroopCount(storage, unitCode, count) {
            if (unitCode === 'militia') return;
            const name = CONFIG.unitNames[unitCode];
            if (!name) return;

            if (!storage[name]) {
                storage[name] = { 
                    count: 0, 
                    icon: `${CONFIG.icons.units}unit_${unitCode}.png` 
                };
            }
            storage[name].count += parseInt(count) || 0;
        }

        // --- DISCORD SENDING ---

        async sendToDiscord(webhookUrl, stats, statusElement) {
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
                    const count = typeof data.count === 'string' ? this.parseNumber(data.count) : data.count;
                    if (count > 0) str += `${name}: ${data.count}\n`;
                }
                return str.trim();
            };

            const homeStr = formatTroopString(stats.troopsHome);
            if (homeStr.length > 0 && homeStr.length < 1024) {
                fields.push({ name: '⚔️ Troops at Home', value: homeStr, inline: false });
            }

            const scavStr = formatTroopString(stats.troopsScavenging);
            if (scavStr.length > 0 && scavStr.length < 1024) {
                fields.push({ name: '🔍 Troops Scavenging', value: scavStr, inline: false });
            }

            const payload = JSON.stringify({
                embeds: [{
                    title: '📊 Tribal Wars Daily Report',
                    color: 5814783, // Discord Blurpleish
                    fields: fields,
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Mystery Inc Bot' }
                }]
            });

            return new Promise((resolve, reject) => {
                const handleSuccess = () => {
                     if (statusElement) statusElement.innerHTML = '<span style="color: #57F287;">✅ Successfully sent to Discord!</span>';
                     resolve();
                };

                const handleError = (msg) => {
                     if (statusElement) statusElement.innerHTML = `<span style="color: #ED4245;">❌ ${msg}</span>`;
                     reject(new Error(msg));
                };

                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: webhookUrl,
                        headers: { 'Content-Type': 'application/json' },
                        data: payload,
                        onload: (res) => {
                            if (res.status >= 200 && res.status < 300) handleSuccess();
                            else handleError(`Status ${res.status}: ${res.responseText}`);
                        },
                        onerror: (err) => handleError('Network Error')
                    });
                } else {
                    // Fallback for non-Tampermonkey environments
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload
                    })
                    .then(handleSuccess)
                    .catch(e => handleError(e.message));
                }
            });
        }

        // --- UTILS ---

        parseNumber(str) {
            if (!str) return 0;
            // Removes spaces, dots, keeps digits
            return parseInt(str.replace(/\s/g, '').replace(/\./g, '').replace(/[^\d]/g, '')) || 0;
        }

        formatNumber(num) {
            return num.toLocaleString('pt-PT');
        }

        // --- AUTO SCHEDULER (Complex Logic preserved for Tab Coordination) ---

        initAutoScheduler() {
            const enabled = localStorage.getItem(CONFIG.keys.autoEnabled) === 'true';
            const time = localStorage.getItem(CONFIG.keys.autoTime) || '23:00';
            const webhook = localStorage.getItem(CONFIG.keys.webhook);

            if (!enabled || !webhook) return;

            // Check every minute
            const now = new Date();
            const delay = (60 - now.getSeconds()) * 1000;

            setTimeout(() => {
                this.checkAutoSend(time, webhook);
                setInterval(() => this.checkAutoSend(time, webhook), 60000);
            }, delay);
        }

        async checkAutoSend(targetTime, webhook) {
            const now = new Date();
            const currentTimeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const dateStr = now.toDateString();
            const uniqueKey = `${dateStr}_${targetTime}`;

            if (currentTimeStr !== targetTime) return;

            // Check if already sent today
            if (localStorage.getItem(CONFIG.keys.sentMarker) === uniqueKey) {
                console.log('Stats already sent today.');
                return;
            }

            // Race Condition Handling using LocalStorage
            // This ensures if 5 tabs are open, only 1 sends the message
            const tabId = 'tab_' + Date.now() + Math.random();
            const nonce = Date.now() + Math.random();
            
            // 1. Declare Intent
            localStorage.setItem(CONFIG.keys.intentMarker, JSON.stringify({ key: uniqueKey, tabId, nonce, timestamp: Date.now() }));
            await new Promise(r => setTimeout(r, Math.random() * 500 + 100));

            // 2. Check if we won Intent
            const currentIntent = JSON.parse(localStorage.getItem(CONFIG.keys.intentMarker) || '{}');
            if (currentIntent.nonce !== nonce) return; // Lost race

            // 3. Promote to "Sending" status
            localStorage.setItem(CONFIG.keys.sendingMarker, JSON.stringify({ key: uniqueKey, tabId, nonce }));
            await new Promise(r => setTimeout(r, 200));

            const currentSending = JSON.parse(localStorage.getItem(CONFIG.keys.sendingMarker) || '{}');
            if (currentSending.nonce !== nonce) return; // Lost race

            // 4. Execute Send
            console.log('This tab is sending the daily stats...');
            localStorage.setItem(CONFIG.keys.sentMarker, uniqueKey); // Mark as sent immediately to block others

            try {
                const stats = await this.gatherStats();
                // Check for saved name override
                const hookId = webhook.split('/').pop();
                const savedName = localStorage.getItem(`tw_player_name_${stats.world}_${hookId}`);
                if (savedName) stats.playerName = savedName;

                await this.sendToDiscord(webhook, stats, null);
                console.log('Auto-send success');
            } catch (e) {
                console.error('Auto-send failed', e);
                // Clear sent marker so it tries again next minute or next tab
                localStorage.removeItem(CONFIG.keys.sentMarker);
            } finally {
                // Cleanup locks
                localStorage.removeItem(CONFIG.keys.intentMarker);
                localStorage.removeItem(CONFIG.keys.sendingMarker);
            }
        }
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new TwDailyStats());
    } else {
        new TwDailyStats();
    }

})();
