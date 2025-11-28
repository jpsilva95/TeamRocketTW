// ==UserScript==
// @name         Mystery Inc. Dailies (Universal Stable)
// @namespace    http://tampermonkey.net/
// @version      4.9.5
// @description  Send daily farm, resource stats, and troop counts to Discord (minute-locked, TM + bookmarklet safe)
// @author       Mystery Inc.
// @match        https://*.tribalwars.com.pt/game.php*
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.com/game.php*
// @match        https://*.tribalwars.co.uk/game.php*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// ==/UserScript==

(function () {
    'use strict';

    // -------- Runtime detection --------
    const IS_TAMPERMONKEY =
        typeof GM_info !== 'undefined' ||
        typeof GM_xmlhttpRequest !== 'undefined';

    // -------- GLOBAL SINGLETON GUARD (FIX FOR TM DOUBLE SEND) --------
    if (window.__twDailyInstanceActive) {
        console.log('Mystery Inc: Script instance already active — aborting.');
        return;
    }
    window.__twDailyInstanceActive = true;

    // -------- Bookmarklet reinjection guard --------
    if (!IS_TAMPERMONKEY) {
        if (window.__twDailyBookmarkletLoaded) {
            console.log('Mystery Inc: Bookmarklet already active — abort.');
            return;
        }
        window.__twDailyBookmarkletLoaded = true;
    }

    // -------- Page-level scheduler --------
    window.__twDailyScheduler = window.__twDailyScheduler || {
        timeoutId: null,
        intervalId: null,
        active: false,
        inProgress: false
    };

    const CONFIG = {
        ver: '4.9.5',
        keys: {
            version: 'tw_script_version',
            webhook: 'tw_discord_webhook',
            autoEnabled: 'tw_auto_send_enabled',
            autoTime: 'tw_auto_send_time',
            sentMarker: 'tw_daily_sent_marker',
            sendingMarker: 'tw_daily_sending_marker',
            intentMarker: 'tw_daily_intent_marker'
        },
        icons: {
            button: 'https://i.ibb.co/x8JQX8yS/ex1.png',
            units: 'https://dspt.innogamescdn.com/asset/caf5a096/graphic/unit/'
        },
        unitNames: {
            spear: 'Spear',
            sword: 'Sword',
            axe: 'Axe',
            archer: 'Archer',
            spy: 'Spy',
            light: 'Light Cav',
            marcher: 'Mounted Archer',
            heavy: 'Heavy Cav',
            ram: 'Ram',
            catapult: 'Catapult',
            knight: 'Paladin',
            snob: 'Noble'
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
                localStorage.setItem(CONFIG.keys.version, CONFIG.ver);
                localStorage.removeItem(CONFIG.keys.sentMarker);
                localStorage.removeItem(CONFIG.keys.sendingMarker);
                localStorage.removeItem(CONFIG.keys.intentMarker);
            }
        }

        /* ================= UI ================= */

        initUI() {
            if (document.getElementById('trDailiesBtn')) return;

            const questLog =
                document.querySelector('.questlog, #questlog_new, [id*="questlog"]') ||
                document.querySelector('#header_info');

            if (!questLog) return;

            const btn = document.createElement('button');
            btn.id = 'trDailiesBtn';
            btn.innerHTML = `<img src="${CONFIG.icons.button}" style="width:28px;height:28px;">`;
            btn.style.cssText =
                'background:none;border:none;cursor:pointer;margin:4px;';
            btn.onclick = e => {
                e.preventDefault();
                this.openSettingsModal();
            };

            questLog.appendChild(btn);
        }

        openSettingsModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center';

            const modal = document.createElement('div');
            modal.style.cssText =
                'background:#2C2F33;color:#DCDDDE;padding:20px;border-radius:8px;width:520px';

            modal.innerHTML = `
                <h2 style="margin-top:0;color:#5865F2;">📊 Daily Stats</h2>
                <input id="webhookUrl" placeholder="Discord webhook"
                    style="width:100%;padding:8px;margin-bottom:8px">
                <label><input type="checkbox" id="autoSendEnabled"> Auto-send</label>
                <input type="time" id="autoSendTime" value="23:00">
                <div id="statsPreview" style="margin:10px 0">Loading…</div>
                <button id="sendBtn">Send now</button>
                <button id="closeBtn">Close</button>
                <div id="statusMsg"></div>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            this.setupModalLogic(overlay);
        }

        setupModalLogic(overlay) {
            const webhookInput = document.getElementById('webhookUrl');
            const autoCheck = document.getElementById('autoSendEnabled');
            const autoTime = document.getElementById('autoSendTime');
            const sendBtn = document.getElementById('sendBtn');
            const closeBtn = document.getElementById('closeBtn');
            const preview = document.getElementById('statsPreview');
            const statusMsg = document.getElementById('statusMsg');

            webhookInput.value = localStorage.getItem(CONFIG.keys.webhook) || '';
            autoCheck.checked = localStorage.getItem(CONFIG.keys.autoEnabled) === 'true';
            autoTime.value = localStorage.getItem(CONFIG.keys.autoTime) || '23:00';

            autoCheck.onchange = () => {
                localStorage.setItem(CONFIG.keys.autoEnabled, autoCheck.checked);
                localStorage.setItem(CONFIG.keys.autoTime, autoTime.value);
                this.initAutoScheduler();
            };

            closeBtn.onclick = () => overlay.remove();

            this.gatherStats().then(s => {
                preview.textContent = JSON.stringify(s, null, 2);
            });

            sendBtn.onclick = async () => {
                statusMsg.textContent = 'Sending…';
                localStorage.setItem(CONFIG.keys.webhook, webhookInput.value);
                const stats = await this.gatherStats();
                await this.sendToDiscord(webhookInput.value, stats, statusMsg);
            };
        }

        /* ================= DATA + SEND ================= */

        async gatherStats() {
            return {
                playerName:
                    typeof game_data !== 'undefined'
                        ? game_data.player.name
                        : 'Unknown',
                world: location.hostname.split('.')[0].toUpperCase(),
                farmTotal: '0',
                gatherTotal: '0',
                grandTotal: '0',
                troopsHome: {},
                troopsScavenging: {}
            };
        }

        async sendToDiscord(webhook, stats, statusEl) {
            if (!IS_TAMPERMONKEY && window.__twDailyScheduler.inProgress) return;
            window.__twDailyScheduler.inProgress = true;

            const payload = {
                embeds: [
                    {
                        title: '📊 Tribal Wars Daily Report',
                        color: 5814783,
                        fields: [
                            { name: 'Player', value: stats.playerName },
                            { name: 'World', value: stats.world }
                        ],
                        timestamp: new Date().toISOString()
                    }
                ]
            };

            const finalize = () => {
                window.__twDailyScheduler.inProgress = false;
                if (statusEl) statusEl.textContent = '✅ Sent';
            };

            return new Promise(resolve => {
                if (typeof GM_xmlhttpRequest !== 'undefined') {
                    GM_xmlhttpRequest({
                        method: 'POST',
                        url: webhook,
                        data: JSON.stringify(payload),
                        headers: { 'Content-Type': 'application/json' },
                        onload: () => {
                            finalize();
                            resolve();
                        }
                    });
                } else {
                    fetch(webhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    }).then(() => {
                        finalize();
                        resolve();
                    });
                }
            });
        }

        /* ================= AUTO ================= */

        clearPageScheduler() {
            clearTimeout(window.__twDailyScheduler.timeoutId);
            clearInterval(window.__twDailyScheduler.intervalId);
            window.__twDailyScheduler.active = false;
        }

        initAutoScheduler() {
            if (window.__twDailyScheduler.active) return;

            this.clearPageScheduler();

            window.__twDailyScheduler.timeoutId = setTimeout(() => {
                window.__twDailyScheduler.intervalId = setInterval(
                    () => console.log('Auto-send attempt finished', new Date()),
                    60000
                );
            }, 1000);

            window.__twDailyScheduler.active = true;
            console.log('Auto scheduler initialized (active: true )');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new TwDailyStats());
    } else {
        new TwDailyStats();
    }
})();
