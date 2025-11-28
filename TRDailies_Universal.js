// ==UserScript==
// @name         Mystery Inc. Dailies (Minute-Locked Version)
// @namespace    http://tampermonkey.net/
// @version      4.9.3
// @description  Send daily farm, resource stats, and troop counts to Discord (1 send per minute globally)
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

    const IS_TAMPERMONKEY =
        typeof GM_info !== 'undefined' ||
        typeof GM_xmlhttpRequest !== 'undefined';

    if (!IS_TAMPERMONKEY) {
        if (window.__twDailyBookmarkletLoaded) return;
        window.__twDailyBookmarkletLoaded = true;
    }

    window.__twDailyScheduler = window.__twDailyScheduler || {
        timeoutId: null,
        intervalId: null,
        active: false,
        inProgress: false
    };

    const CONFIG = {
        ver: '4.9.3',
        keys: {
            version: 'tw_script_version',
            webhook: 'tw_discord_webhook',
            autoEnabled: 'tw_auto_send_enabled',
            autoTime: 'tw_auto_send_time',
            minuteLock: 'tw_send_minute_lock'
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
            }
        }

        /* ====================== GLOBAL MINUTE LOCK ====================== */

        getCurrentMinuteKey() {
            const d = new Date();
            d.setSeconds(0, 0);
            return d.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
        }

        async attemptMinuteLock() {
            const minute = this.getCurrentMinuteKey();
            const tabId =
                'tab_' +
                Date.now() +
                '_' +
                Math.random().toString(36).slice(2);

            const payload = {
                minute,
                tabId,
                timestamp: Date.now()
            };

            localStorage.setItem(
                CONFIG.keys.minuteLock,
                JSON.stringify(payload)
            );

            await new Promise(r =>
                setTimeout(r, Math.random() * 300 + 100)
            );

            try {
                const current = JSON.parse(
                    localStorage.getItem(CONFIG.keys.minuteLock)
                );
                return (
                    current &&
                    current.minute === minute &&
                    current.tabId === tabId
                );
            } catch {
                return false;
            }
        }

        /* ====================== DISCORD SEND ====================== */

        async sendToDiscord(webhookUrl, stats, statusElement) {
            // GLOBAL: 1 send per minute
            const wonMinute = await this.attemptMinuteLock();
            if (!wonMinute) {
                if (statusElement) {
                    statusElement.innerHTML =
                        '<span style="color:#ED4245;">⏳ A send already occurred this minute</span>';
                }
                throw new Error('Send already occurred this minute');
            }

            // PAGE-LEVEL (bookmarklet only)
            if (!IS_TAMPERMONKEY) {
                if (window.__twDailyScheduler.inProgress) {
                    if (statusElement) {
                        statusElement.innerHTML =
                            '<span style="color:#ED4245;">❌ Send already in progress on this page</span>';
                    }
                    throw new Error('Send already in progress on this page');
                }
                window.__twDailyScheduler.inProgress = true;
            }

            const finalize = () => {
                if (!IS_TAMPERMONKEY)
                    window.__twDailyScheduler.inProgress = false;
            };

            try {
                const fields = [
                    {
                        name: 'Player',
                        value: '👤 ' + stats.playerName,
                        inline: false
                    },
                    {
                        name: 'World',
                        value: '🌍 ' + stats.world,
                        inline: false
                    },
                    {
                        name: 'Daily Farm',
                        value: '🌾 ' + stats.farmTotal,
                        inline: true
                    },
                    {
                        name: 'Daily Resources',
                        value: '📦 ' + stats.gatherTotal,
                        inline: true
                    },
                    {
                        name: 'Grand Total',
                        value: '💰 ' + stats.grandTotal,
                        inline: false
                    }
                ];

                const payload = JSON.stringify({
                    embeds: [
                        {
                            title: '📊 Tribal Wars Daily Report',
                            color: 5814783,
                            fields,
                            timestamp: new Date().toISOString()
                        }
                    ]
                });

                await new Promise((resolve, reject) => {
                    if (typeof GM_xmlhttpRequest !== 'undefined') {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: webhookUrl,
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            data: payload,
                            onload: res =>
                                res.status >= 200 && res.status < 300
                                    ? resolve()
                                    : reject(res.status),
                            onerror: reject
                        });
                    } else {
                        fetch(webhookUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: payload
                        })
                            .then(r =>
                                r.ok
                                    ? resolve()
                                    : reject(r.status)
                            )
                            .catch(reject);
                    }
                });

                if (statusElement) {
                    statusElement.innerHTML =
                        '<span style="color:#57F287;">✅ Successfully sent!</span>';
                }
            } finally {
                finalize();
            }
        }

        /* ====================== AUTO SCHEDULER ====================== */

        clearPageScheduler() {
            if (window.__twDailyScheduler.timeoutId)
                clearTimeout(window.__twDailyScheduler.timeoutId);
            if (window.__twDailyScheduler.intervalId)
                clearInterval(window.__twDailyScheduler.intervalId);

            window.__twDailyScheduler.timeoutId = null;
            window.__twDailyScheduler.intervalId = null;
            window.__twDailyScheduler.active = false;
        }

        initAutoScheduler() {
            const enabled =
                localStorage.getItem(CONFIG.keys.autoEnabled) ===
                'true';
            const time =
                localStorage.getItem(CONFIG.keys.autoTime) || '23:00';
            const webhook =
                localStorage.getItem(CONFIG.keys.webhook);

            if (!enabled || !webhook) {
                this.clearPageScheduler();
                return;
            }

            if (
                !IS_TAMPERMONKEY &&
                window.__twDailyScheduler.active
            )
                return;

            this.clearPageScheduler();

            const delay = (60 - new Date().getSeconds()) * 1000;
            window.__twDailyScheduler.timeoutId = setTimeout(
                () => {
                    this.checkAutoSend(time, webhook);
                    window.__twDailyScheduler.intervalId =
                        setInterval(
                            () =>
                                this.checkAutoSend(
                                    time,
                                    webhook
                                ),
                            60000
                        );
                },
                delay
            );

            window.__twDailyScheduler.active = true;
        }

        async checkAutoSend(targetTime, webhook) {
            const now = new Date();
            const [h, m] = targetTime.split(':').map(Number);
            const target = new Date(now);
            target.setHours(h, m, 0, 0);

            const delta = now - target;
            if (delta < 0 || delta >= 60000) return;

            try {
                const stats = await this.gatherStats();
                await this.sendToDiscord(webhook, stats, null);
            } catch (e) {
                console.error('Auto-send failed', e);
            }
        }

        /* ====================== STATS (UNCHANGED) ====================== */
        // Your existing gatherStats(), fetchTroops(), UI code etc
        // was intentionally left untouched for stability.
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            () => new TwDailyStats()
        );
    } else {
        new TwDailyStats();
    }
})();
