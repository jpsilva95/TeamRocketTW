// ==UserScript==
// @name         Mystery Inc. Dailies (v8.2 Config Fix)
// @namespace    http://tampermonkey.net
// @version      8.2
// @description  Send daily farm, resource stats, and troop counts to Discord (Uses native game_data for unit detection)
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

    const IS_TAMPERMONKEY = (typeof GM_info !== 'undefined') || (typeof GM_xmlhttpRequest !== 'undefined');

    if (window.__twDailyInstanceActive) {
        console.log('Mystery Inc: Script instance already active — aborting.');
        return;
    }
    window.__twDailyInstanceActive = true;

    if (!IS_TAMPERMONKEY) {
        if (window.__twDailyBookmarkletLoaded) {
            console.log('Mystery Inc: Bookmarklet already active — aborting reinjection.');
            return;
        }
        window.__twDailyBookmarkletLoaded = true;
    }

    window.__twDailyScheduler = window.__twDailyScheduler || {
        timeoutId: null,
        intervalId: null,
        active: false,
        inProgress: false
    };

    function acquireGlobalSendLock() {
        try {
            const lockKey = 'tw_global_send_lock_minute';
            const currentMinute = Math.floor(Date.now() / 60000);
            const stored = Number(localStorage.getItem(lockKey));
            if (stored === currentMinute) return false;
            localStorage.setItem(lockKey, String(currentMinute));
            return true;
        } catch {
            return true;
        }
    }

    const CONFIG = {
        ver: '8.2',
        keys: {
            version: 'tw_script_version',
            webhook: 'tw_discord_webhook',
            autoEnabled: 'tw_auto_send_enabled',
            autoTime: 'tw_auto_send_time',
            lastAutoDate: 'tw_last_auto_send',
            sentMarker: 'tw_daily_sent_marker',
            sendingMarker: 'tw_daily_sending_marker',
            intentMarker: 'tw_daily_intent_marker',
            minuteLock: 'tw_send_minute_lock'
        },
        icons: {
            button: 'https://i.ibb.co/x8JQX8yS/ex1.png',
            units: 'https://dspt.innogamescdn.com/asset/caf5a096/graphic/unit/'
        },
        // Display names map
        unitNames: {
            'spear': 'Spear', 'sword': 'Sword', 'axe': 'Axe', 'archer': 'Archer',
            'spy': 'Spy', 'light': 'Light Cav', 'marcher': 'Mounted Archer',
            'heavy': 'Heavy Cav', 'ram': 'Ram', 'catapult': 'Catapult',
            'knight': 'Paladin', 'snob': 'Noble', 'militia': 'Militia'
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
                try {
                    localStorage.removeItem(CONFIG.keys.sentMarker);
                    localStorage.removeItem(CONFIG.keys.sendingMarker);
                    localStorage.removeItem(CONFIG.keys.intentMarker);
                    localStorage.removeItem(CONFIG.keys.lastAutoDate);
                } catch {}
            }
        }

        initUI() {
            if (document.getElementById('trDailiesBtn')) return;

            const questLog = document.querySelector('.questlog, #questlog_new, [id*="questlog"]');
            if (questLog) {
                const container = document.createElement('div');
                container.style.cssText = 'margin-top: 5px; text-align: center;';
                const btn = document.createElement('button');
                btn.id = 'trDailiesBtn';
                btn.title = 'Daily Stats to Discord';
                btn.style.cssText = 'width: 40px; height: 40px; background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;';
                const img = document.createElement('img');
                img.src = CONFIG.icons.button;
                img.style.cssText = 'width: 45px; height: 45px;';
                btn.appendChild(img);
                btn.onclick = (e) => { e.preventDefault(); this.openSettingsModal(); };
                container.appendChild(btn);
                questLog.appendChild(container);
            } else {
                const headerInfo = document.querySelector('#header_info');
                if (headerInfo) {
                    const link = document.createElement('a');
                    link.id = 'trDailiesBtn';
                    link.href = '#';
                    link.title = 'Daily Stats';
                    link.style.cssText = 'margin-left: 10px; padding: 5px; background: transparent; border: none; text-decoration: none; display: inline-block;';
                    const img = document.createElement('img');
                    img.src = CONFIG.icons.button;
                    img.style.cssText = 'width: 20px; height: 20px; vertical-align: middle;';
                    link.appendChild(img);
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

            const title = document.createElement('h2');
            title.style.cssText = 'margin-top: 0; color: #5865F2;';
            title.textContent = '📊 Send Daily Stats to Discord';
            modal.appendChild(title);

            const webhookWrap = document.createElement('div');
            webhookWrap.style.cssText = 'margin-bottom: 15px;';
            const webhookLabel = document.createElement('label');
            webhookLabel.style.cssText = 'display: block; margin-bottom: 5px; font-weight: bold;';
            webhookLabel.textContent = 'Discord Webhook URL:';
            const webhookInput = document.createElement('input');
            webhookInput.type = 'text';
            webhookInput.id = 'webhookUrl';
            webhookInput.placeholder = 'https://discord.com/api/webhooks/...';
            webhookInput.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;';
            webhookWrap.appendChild(webhookLabel);
            webhookWrap.appendChild(webhookInput);
            modal.appendChild(webhookWrap);

            const autoWrap = document.createElement('div');
            autoWrap.style.cssText = 'margin-bottom: 15px;';
            const autoLabel = document.createElement('label');
            autoLabel.style.cssText = 'display: block; margin-bottom: 5px;';
            const autoCheck = document.createElement('input');
            autoCheck.type = 'checkbox';
            autoCheck.id = 'autoSendEnabled';
            autoCheck.style.cssText = 'margin-right: 5px;';
            const autoLabelStrong = document.createElement('strong');
            autoLabelStrong.textContent = 'Auto-send daily at:';
            autoLabel.appendChild(autoCheck);
            autoLabel.appendChild(autoLabelStrong);
            const autoTime = document.createElement('input');
            autoTime.type = 'time';
            autoTime.id = 'autoSendTime';
            autoTime.value = '23:00';
            autoTime.disabled = true;
            autoTime.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;';
            const autoNote = document.createElement('p');
            autoNote.style.cssText = 'font-size: 12px; color: #B9BBBE; margin: 5px 0 0 0;';
            autoNote.textContent = 'Leave the game open for auto-send to work';
            autoWrap.appendChild(autoLabel);
            autoWrap.appendChild(autoTime);
            autoWrap.appendChild(autoNote);
            modal.appendChild(autoWrap);

            const preview = document.createElement('div');
            preview.id = 'statsPreview';
            preview.style.cssText = 'background: #40444B; padding: 15px; border-radius: 4px; margin-bottom: 15px;';
            const previewP = document.createElement('p');
            previewP.style.cssText = 'margin: 5px 0;';
            const previewStrong = document.createElement('strong');
            previewStrong.textContent = 'Gathering stats...';
            previewP.appendChild(previewStrong);
            preview.appendChild(previewP);
            modal.appendChild(preview);

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display: flex; gap: 10px;';
            const sendBtn = document.createElement('button');
            sendBtn.id = 'sendBtn';
            sendBtn.style.cssText = 'flex: 1; padding: 10px; background: #5865F2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;';
            sendBtn.textContent = 'Send to Discord';
            const closeBtn = document.createElement('button');
            closeBtn.id = 'closeBtn';
            closeBtn.style.cssText = 'flex: 1; padding: 10px; background: #ED4245; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;';
            closeBtn.textContent = 'Close';
            btnRow.appendChild(sendBtn);
            btnRow.appendChild(closeBtn);
            modal.appendChild(btnRow);

            const statusMsg = document.createElement('div');
            statusMsg.id = 'statusMsg';
            statusMsg.style.cssText = 'margin-top: 15px; text-align: center; font-size: 14px;';
            modal.appendChild(statusMsg);

            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // Modal logic
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

        async getWorldConfig(baseUrl) {
             try {
                const root = baseUrl.replace(/game\.php.*/, '');
                const res = await fetch(`${root}interface.php?func=get_config`);
                const xml = new DOMParser().parseFromString(await res.text(), 'text/xml');
                const scav = xml.querySelector('config > game > scavenging');
                return {
                    scavenging: scav && scav.textContent.trim() === "1"
                };
            } catch (e) {
                console.error("Error checking config", e);
                return { scavenging: true };
            }
        }

        async fetchTroopCounts(baseUrl, search, stats) {
            const config = await this.getWorldConfig(baseUrl);

            // Get valid units from game_data (removes militia/snob if needed)
            // We filter militia out because usually we don't care about counting it for reports
            let validUnits = [];
            if (typeof game_data !== 'undefined' && game_data.units) {
                 validUnits = game_data.units.filter(u => u !== 'militia');
            } else {
                // Fallback if game_data isn't available for some reason (rare)
                validUnits = ['spear','sword','axe','spy','light','heavy','ram','catapult','knight','snob'];
            }

            if (config.scavenging) {
                let page = 0, done = false;
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
                                for (const [unit, count] of Object.entries(v.unit_counts_home)) {
                                     // Only add if it's a valid unit for this world
                                     if(validUnits.includes(unit)) this.addTroopCount(stats.troopsHome, unit, count);
                                }
                            }
                            if (v.options) {
                                Object.values(v.options).forEach(opt => {
                                    if (opt.scavenging_squad && opt.scavenging_squad.unit_counts) {
                                        for (const [unit, count] of Object.entries(opt.scavenging_squad.unit_counts)) {
                                             if(validUnits.includes(unit)) this.addTroopCount(stats.troopsScavenging, unit, count);
                                        }
                                    }
                                });
                            }
                        });
                    } catch (jsonErr) { console.error("JSON Parse error on page " + page, jsonErr); }
                    page++;
                    await new Promise(r => setTimeout(r, 200));
                }
            } else {
                // Non-scavenging world (e.g., older classic worlds)
                let page = 0, lastVillageId = null;
                while (true) {
                    const url = `${baseUrl}?${search.toString()}&screen=overview_villages&mode=units&page=${page}`;
                    const res = await fetch(url);
                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const unitsTable = doc.querySelector('#units_table');
                    if (!unitsTable) break;

                    const tbodyList = unitsTable.querySelectorAll('tbody');
                    if (!tbodyList.length) break;

                    const firstVillageId = tbodyList[0].querySelector('span[data-id]')?.getAttribute('data-id');
                    if (lastVillageId && lastVillageId === firstVillageId) break;
                    lastVillageId = firstVillageId;

                    tbodyList.forEach(tbody => {
                        const firstRow = tbody.querySelector('tr');
                        if (!firstRow) return;
                        const cells = firstRow.querySelectorAll('td');

                        // The first few cells are village info, troops start after that.
                        // usually index 0 is checkbox, 1 is village name.
                        // We skip those. The exact start depends on the page layout,
                        // but usually troops correspond to the validUnits list in order.
                        const startColIndex = 2; 

                        validUnits.forEach((unitCode, idx) => {
                             const cell = cells[startColIndex + idx];
                             if (cell) {
                                 const val = parseInt(String(cell.textContent).trim().replace(/\D/g, '')) || 0;
                                 this.addTroopCount(stats.troopsHome, unitCode, val);
                             }
                        });
                    });
                    page++;
                    await new Promise(r => setTimeout(r, 200));
                }
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

        getCurrentMinuteKey() {
            const d = new Date();
            d.setSeconds(0, 0);
            return d.toISOString().slice(0, 16);
        }

        async attemptMinuteLock() {
            const minute = this.getCurrentMinuteKey();
            const tabId = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const payload = { minute, tabId, ts: Date.now() };
            try {
                localStorage.setItem(CONFIG.keys.minuteLock, JSON.stringify(payload));
            } catch (e) {
                return false;
            }
            await new Promise(r => setTimeout(r, Math.random() * 300 + 100));
            try {
                const current = JSON.parse(localStorage.getItem(CONFIG.keys.minuteLock) || '{}');
                return current && current.minute === minute && current.tabId === tabId;
            } catch {
                return false;
            }
        }

        async sendToDiscord(webhookUrl, stats, statusElement) {
            const gotGlobalLock = acquireGlobalSendLock();
            if (!gotGlobalLock) {
                if (statusElement) statusElement.innerHTML = '<span style="color: #ED4245;">⏳ A send already occurred this minute (duplicate suppressed)</span>';
                return;
            }

            const wonMinute = await this.attemptMinuteLock();
            if (!wonMinute) {
                if (statusElement) {
                    statusElement.innerHTML = '<span style="color: #ED4245;">⏳ A send already occurred this minute</span>';
                }
                return;
            }

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

        parseNumber(str) {
            if (!str) return 0;
            if (typeof str === 'number') return str;
            return parseInt(String(str).replace(/\s/g, '').replace(/\./g, '').replace(/[^\d]/g, '')) || 0;
        }

        formatNumber(num) {
            return num.toLocaleString('pt-PT');
        }

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

            if (!IS_TAMPERMONKEY) {
                if (window.__twDailyScheduler.active) {
                    console.log('Bookmarklet: scheduler already active - skipping init.');
                    return;
                }
            }

            this.clearPageScheduler();

            const now = new Date();
            const delay = (60 - now.getSeconds()) * 1000;

            window.__twDailyScheduler.timeoutId = setTimeout(() => {
                const check = () => {
                    const current = new Date();
                    const currentStr = current.toTimeString().slice(0, 5);
                    const lastSent = localStorage.getItem(CONFIG.keys.lastAutoDate);
                    const today = current.toDateString();

                    if (currentStr === time && lastSent !== today) {
                        console.log('Mystery Inc: Auto-sending stats...');
                        localStorage.setItem(CONFIG.keys.lastAutoDate, today);
                        this.gatherStats().then(stats => {
                            const url = localStorage.getItem(CONFIG.keys.webhook);
                            if (url) this.sendToDiscord(url, stats, null);
                        });
                    }
                };
                check();
                window.__twDailyScheduler.intervalId = setInterval(check, 60000);
                window.__twDailyScheduler.active = true;
            }, delay);
        }
    }

    new TwDailyStats();

})();
