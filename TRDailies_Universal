(function() {
    'use strict';

    // Create button in the quest area
    function createStatsButton() {
        // Prevent duplicate buttons
        if (document.getElementById('trDailiesBtn')) return;

        // Look for the quest area
        const questArea = document.querySelector('.questlog, #questlog_new, [id*="questlog"]');

        if (questArea) {
            // Create a container for our button
            const btnContainer = document.createElement('div');
            btnContainer.style.cssText = 'margin-top: 5px; text-align: center;';

            const btn = document.createElement('button');
            btn.id = 'trDailiesBtn';
            btn.innerHTML = '<img src="https://i.ibb.co/RptK4TP5/teamrocketlogo.gif" style="width: 30px; height: 30px;">';
            btn.title = 'Daily Stats to Discord';
            btn.style.cssText = 'width: 40px; height: 40px; background: transparent; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0;';
            btn.onclick = (e) => {
                e.preventDefault();
                openStatsPopup();
            };

            btnContainer.appendChild(btn);
            questArea.appendChild(btnContainer);
        } else {
            // Fallback to header if quest area not found
            const headerInfo = document.querySelector('#header_info');
            if (headerInfo) {
                const btn = document.createElement('a');
                btn.id = 'trDailiesBtn';
                btn.href = '#';
                btn.innerHTML = '<img src="https://i.ibb.co/RptK4TP5/teamrocketlogo.gif" style="width: 20px; height: 20px; vertical-align: middle;">';
                btn.title = 'Daily Stats';
                btn.style.cssText = 'margin-left: 10px; padding: 5px; background: transparent; border: none; text-decoration: none; display: inline-block;';
                btn.onclick = (e) => {
                    e.preventDefault();
                    openStatsPopup();
                };
                headerInfo.appendChild(btn);
            }
        }
    }

    // Open popup for webhook configuration
    function openStatsPopup() {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;';

        // Create popup
        const popup = document.createElement('div');
        popup.style.cssText = 'background: #2C2F33; color: #DCDDDE; padding: 25px; border-radius: 8px; width: 550px; box-shadow: 0 8px 16px rgba(0,0,0,0.3);';

        popup.innerHTML = `
            <h2 style="margin-top: 0; color: #5865F2;">📊 Send Daily Stats to Discord</h2>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Discord Webhook URL:</label>
                <input type="text" id="webhookUrl" placeholder="https://discord.com/api/webhooks/..."
                    style="width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;">
            </div>

            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px;">
                    <input type="checkbox" id="autoSendEnabled" style="margin-right: 5px;">
                    <strong>Auto-send daily at:</strong>
                </label>
                <input type="time" id="autoSendTime" value="23:00" disabled
                    style="width: 100%; padding: 8px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box;">
                <p style="font-size: 12px; color: #B9BBBE; margin: 5px 0 0 0;">Leave the game open for auto-send to work</p>
            </div>

            <div id="statsPreview" style="background: #40444B; padding: 15px; border-radius: 4px; margin-bottom: 15px;">
                <p style="margin: 5px 0;"><strong>Gathering stats...</strong></p>
            </div>

            <div style="display: flex; gap: 10px;">
                <button id="sendBtn" style="flex: 1; padding: 10px; background: #5865F2; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    Send to Discord
                </button>
                <button id="closeBtn" style="flex: 1; padding: 10px; background: #ED4245; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold;">
                    Close
                </button>
            </div>

            <div id="statusMsg" style="margin-top: 15px; text-align: center; font-size: 14px;"></div>
        `;

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        // Load saved webhook and auto-send settings
        const savedWebhook = localStorage.getItem('tw_discord_webhook');
        const savedAutoSend = localStorage.getItem('tw_auto_send_enabled') === 'true';
        const savedTime = localStorage.getItem('tw_auto_send_time') || '23:00';

        if (savedWebhook) {
            document.getElementById('webhookUrl').value = savedWebhook;
        }

        const autoSendCheckbox = document.getElementById('autoSendEnabled');
        const autoSendTime = document.getElementById('autoSendTime');

        autoSendCheckbox.checked = savedAutoSend;
        autoSendTime.value = savedTime;
        autoSendTime.disabled = !savedAutoSend;

        autoSendCheckbox.onchange = () => {
            autoSendTime.disabled = !autoSendCheckbox.checked;
            localStorage.setItem('tw_auto_send_enabled', autoSendCheckbox.checked);
            if (autoSendCheckbox.checked) {
                localStorage.setItem('tw_auto_send_time', autoSendTime.value);
                setupAutoSend();
            }
        };

        autoSendTime.onchange = () => {
            localStorage.setItem('tw_auto_send_time', autoSendTime.value);
            if (autoSendCheckbox.checked) {
                setupAutoSend();
            }
        };

        // Gather stats
        const preview = document.getElementById('statsPreview');
        preview.innerHTML = '<p style="margin: 5px 0;"><strong>Loading stats...</strong></p>';

        gatherStats().then(stats => {
            let troopsText = '';
            if (Object.keys(stats.troops).length > 0) {
                troopsText = '<p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>⚔️ Total Troops at Home:</strong></p>';
                for (let [unit, data] of Object.entries(stats.troops)) {
                    const icon = data.icon ? `<img src="${data.icon}" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 4px;">` : '';
                    troopsText += `<p style="margin: 2px 0; padding-left: 20px; font-size: 13px;">${icon}${unit}: ${data.count}</p>`;
                }
            }

            // Save player name with webhook + world as key (for multiple accounts on same world)
            if (stats.playerName && stats.playerName !== 'Unknown') {
                const webhookUrl = document.getElementById('webhookUrl').value.trim();
                if (webhookUrl) {
                    const webhookHash = webhookUrl.split('/').pop();
                    const cacheKey = `tw_player_name_${stats.world}_${webhookHash}`;
                    localStorage.setItem(cacheKey, stats.playerName);
                }
            }

            // Show manual override field if player name is Unknown
            let manualNameField = '';
            if (stats.playerName === 'Unknown') {
                manualNameField = `
                    <div style="margin: 10px 0; padding: 10px; background: #ED4245; border-radius: 4px;">
                        <p style="margin: 0 0 5px 0; font-size: 12px; color: white;"><strong>⚠️ Player name not detected</strong></p>
                        <input type="text" id="manualPlayerName" placeholder="Enter your player name"
                            style="width: 100%; padding: 6px; border: 1px solid #40444B; background: #40444B; color: #DCDDDE; border-radius: 4px; box-sizing: border-box; font-size: 13px;">
                    </div>
                `;
            }

            preview.innerHTML = `
                <p style="margin: 5px 0;"><strong>🌍 World:</strong> ${stats.world}</p>
                <p style="margin: 5px 0;"><strong>👤 Player:</strong> ${stats.playerName}</p>
                ${manualNameField}
                <p style="margin: 5px 0;"><strong>🌾 Daily Farm Total:</strong> ${stats.farmTotal}</p>
                <p style="margin: 5px 0;"><strong>📦 Daily Resources Total:</strong> ${stats.gatherTotal}</p>
                <p style="margin: 10px 0 5px 0; border-top: 1px solid #2C2F33; padding-top: 10px;"><strong>💰 Grand Total:</strong> ${stats.grandTotal}</p>
                ${troopsText}
            `;
        }).catch(error => {
            preview.innerHTML = '<p style="margin: 5px 0; color: #ED4245;"><strong>Error loading stats. Please try again.</strong></p>';
            console.error('Error gathering stats:', error);
        });

        // Event listeners
        document.getElementById('closeBtn').onclick = () => {
            document.body.removeChild(overlay);
        };

        document.getElementById('sendBtn').onclick = async () => {
            const webhookUrl = document.getElementById('webhookUrl').value.trim();
            const statusMsg = document.getElementById('statusMsg');

            if (!webhookUrl) {
                statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Please enter a webhook URL</span>';
                return;
            }

            localStorage.setItem('tw_discord_webhook', webhookUrl);
            statusMsg.innerHTML = '<span style="color: #FEE75C;">⏳ Sending...</span>';

            const stats = await gatherStats();

            // Check if manual name was entered
            const manualNameInput = document.getElementById('manualPlayerName');
            if (manualNameInput && manualNameInput.value.trim()) {
                stats.playerName = manualNameInput.value.trim();
                const webhookHash = webhookUrl.split('/').pop();
                const cacheKey = `tw_player_name_${stats.world}_${webhookHash}`;
                localStorage.setItem(cacheKey, stats.playerName);
            }

            sendToDiscord(webhookUrl, stats, statusMsg);
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
    }

    // Parse number from string
    function parseNumber(str) {
        if (!str) return 0;
        const cleaned = str.replace(/\s/g, '').replace(/\./g, '').replace(/[^\d]/g, '');
        return parseInt(cleaned) || 0;
    }

    // Format number with separators
    function formatNumber(num) {
        return num.toLocaleString('pt-PT');
    }

    // Gather daily stats
    async function gatherStats() {
        const stats = {
            farmResources: { wood: 'N/A', clay: 'N/A', iron: 'N/A' },
            gatherResources: { wood: 'N/A', clay: 'N/A', iron: 'N/A' },
            farmTotal: 'N/A',
            gatherTotal: 'N/A',
            grandTotal: 'N/A',
            playerName: 'Unknown',
            troops: {},
            world: 'Unknown'
        };

        try {
            const baseUrl = window.location.origin + window.location.pathname;
            const params = new URLSearchParams(window.location.search);

            // Get world identifier from URL
            const worldMatch = window.location.hostname.match(/^(\w+)\./);
            stats.world = worldMatch ? worldMatch[1].toUpperCase() : 'Unknown';

            // Get player name from profile page
            const profileResponse = await fetch(`${baseUrl}?${params.toString()}&screen=info_player`);
            const profileText = await profileResponse.text();
            const profileDoc = new DOMParser().parseFromString(profileText, 'text/html');

            const selectedTab = profileDoc.querySelector('td.selected a[href*="screen=info_player"]');
            if (selectedTab) {
                stats.playerName = selectedTab.textContent.trim();
            }

            if (stats.playerName === 'Unknown' || !stats.playerName) {
                const modemenuLink = profileDoc.querySelector('table.vis.modemenu td.selected a');
                if (modemenuLink) {
                    stats.playerName = modemenuLink.textContent.trim();
                }
            }

            if (stats.playerName === 'Unknown' || !stats.playerName) {
                const menuPlayer = document.querySelector('#menu_row2 a[href*="screen=info_player"]:not([href*="id="])');
                if (menuPlayer) {
                    stats.playerName = menuPlayer.textContent.trim();
                }
            }

            if (stats.playerName === 'Unknown' || !stats.playerName) {
                const menuRow = document.querySelector('#menu_row2');
                if (menuRow) {
                    const allLinks = menuRow.querySelectorAll('a[href*="screen=info_player"]:not([href*="id="])');
                    if (allLinks.length > 0) {
                        stats.playerName = allLinks[0].textContent.trim();
                    }
                }
            }

            // Fetch farm stats
            const lootResponse = await fetch(`${baseUrl}?${params.toString()}&screen=ranking&mode=in_a_day&type=loot_res`);
            const lootText = await lootResponse.text();
            const lootDoc = new DOMParser().parseFromString(lootText, 'text/html');

            const myResultElement = lootDoc.querySelector('#content_value');
            if (myResultElement) {
                const resultText = myResultElement.textContent;
                const resultMatch = resultText.match(/O\s+meu\s+resultado\s+de\s+hoje:\s*([\d\s\.]+)/i);
                if (resultMatch) {
                    const farmTotal = parseNumber(resultMatch[1]);
                    stats.farmTotal = formatNumber(farmTotal);

                    const lootRow = lootDoc.querySelector('#in_a_day_ranking_table tr.lit, #in_a_day_ranking_table tr.lit-item');
                    if (lootRow) {
                        const cells = lootRow.querySelectorAll('td');
                        if (cells.length >= 5) {
                            stats.farmResources.wood = formatNumber(parseNumber(cells[2]?.textContent));
                            stats.farmResources.clay = formatNumber(parseNumber(cells[3]?.textContent));
                            stats.farmResources.iron = formatNumber(parseNumber(cells[4]?.textContent));
                        }
                    }
                }
            }

            // Fetch gather stats
            const scavengeResponse = await fetch(`${baseUrl}?${params.toString()}&screen=ranking&mode=in_a_day&type=scavenge`);
            const scavengeText = await scavengeResponse.text();
            const scavengeDoc = new DOMParser().parseFromString(scavengeText, 'text/html');

            const myGatherElement = scavengeDoc.querySelector('#content_value');
            if (myGatherElement) {
                const gatherText = myGatherElement.textContent;
                const gatherMatch = gatherText.match(/O\s+meu\s+resultado\s+de\s+hoje:\s*([\d\s\.]+)/i);
                if (gatherMatch) {
                    const gatherTotal = parseNumber(gatherMatch[1]);
                    stats.gatherTotal = formatNumber(gatherTotal);

                    const scavengeRow = scavengeDoc.querySelector('#in_a_day_ranking_table tr.lit, #in_a_day_ranking_table tr.lit-item');
                    if (scavengeRow) {
                        const cells = scavengeRow.querySelectorAll('td');
                        if (cells.length >= 5) {
                            stats.gatherResources.wood = formatNumber(parseNumber(cells[2]?.textContent));
                            stats.gatherResources.clay = formatNumber(parseNumber(cells[3]?.textContent));
                            stats.gatherResources.iron = formatNumber(parseNumber(cells[4]?.textContent));
                        }
                    }
                }
            }

            // Calculate grand total
            if (stats.gatherTotal !== 'N/A' && stats.farmTotal !== 'N/A') {
                const gatherSum = parseNumber(stats.gatherTotal);
                const farmSum = parseNumber(stats.farmTotal);
                stats.grandTotal = formatNumber(gatherSum + farmSum);
            }

            // Fetch troop counts
            const troopsResponse = await fetch(`${baseUrl}?${params.toString()}&screen=overview_villages&mode=units`);
            const troopsText = await troopsResponse.text();
            const troopsDoc = new DOMParser().parseFromString(troopsText, 'text/html');

            const headerRow = troopsDoc.querySelector('#units_table thead tr');
            const unitColumnMapping = {};
            const baseUrl_cdn = 'https://dspt.innogamescdn.com/asset/caf5a096/graphic/unit/';

            if (headerRow) {
                const headerCells = headerRow.querySelectorAll('th');
                headerCells.forEach((cell, index) => {
                    const img = cell.querySelector('img[src*="unit"]');
                    if (img && img.src) {
                        let unitMatch = img.src.match(/unit_(\w+)\./);
                        if (!unitMatch) unitMatch = img.src.match(/unit\/(\w+)\./);
                        if (!unitMatch) unitMatch = img.src.match(/unit[_\/]([^._]+)/);

                        if (unitMatch) {
                            const unitType = unitMatch[1];
                            const unitNames = {
                                'spear': 'Spear', 'sword': 'Sword', 'axe': 'Axe',
                                'archer': 'Archer', 'spy': 'Spy', 'light': 'Light Cav',
                                'marcher': 'Mounted Archer', 'heavy': 'Heavy Cav',
                                'ram': 'Ram', 'catapult': 'Catapult',
                                'knight': 'Paladin', 'snob': 'Noble'
                            };

                            if (unitNames[unitType]) {
                                unitColumnMapping[index] = {
                                    name: unitNames[unitType],
                                    icon: baseUrl_cdn + 'unit_' + unitType + '.png'
                                };
                            }
                        }
                    }
                });
            }

            const allRows = troopsDoc.querySelectorAll('#units_table tbody tr');
            const troopTotals = {};

            allRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0 && cells[0].textContent.trim().toLowerCase() === 'na aldeia') {
                    cells.forEach((cell, cellIndex) => {
                        const headerIndex = cellIndex + 1;
                        if (unitColumnMapping[headerIndex]) {
                            const count = parseNumber(cell.textContent);
                            if (!troopTotals[headerIndex]) troopTotals[headerIndex] = 0;
                            troopTotals[headerIndex] += count;
                        }
                    });
                }
            });

            for (let [columnIndex, total] of Object.entries(troopTotals)) {
                const unitInfo = unitColumnMapping[columnIndex];
                if (unitInfo && total > 0) {
                    stats.troops[unitInfo.name] = {
                        count: formatNumber(total),
                        icon: unitInfo.icon
                    };
                }
            }

        } catch (e) {
            console.log('Error gathering stats:', e);
        }

        return stats;
    }

    // Send to Discord webhook - UNIVERSAL VERSION
    function sendToDiscord(webhookUrl, stats, statusMsg) {
        const fields = [
            { name: '👤 Player', value: stats.playerName, inline: false },
            { name: '🌍 World', value: stats.world, inline: false },
            { name: '🌾 Daily Farm Total', value: stats.farmTotal, inline: true },
            { name: '📦 Daily Resources Total', value: stats.gatherTotal, inline: true },
            { name: '💰 Grand Total', value: stats.grandTotal, inline: false }
        ];

        if (Object.keys(stats.troops).length > 0) {
            let troopsText = '';
            for (let [unit, data] of Object.entries(stats.troops)) {
                troopsText += `${unit}: ${data.count}\n`;
            }
            fields.push({
                name: '⚔️ Total Troops at Home',
                value: troopsText.trim(),
                inline: false
            });
        }

        const embed = {
            title: '📊 Tribal Wars Daily Report',
            color: 5814783,
            fields: fields,
            timestamp: new Date().toISOString(),
            footer: { text: 'TeamRocket Bot' }
        };

        const payload = JSON.stringify({ embeds: [embed] });

        // UNIVERSAL: Check if GM_xmlhttpRequest is available (Tampermonkey)
        if (typeof GM_xmlhttpRequest !== 'undefined') {
            // Tampermonkey environment
            GM_xmlhttpRequest({
                method: 'POST',
                url: webhookUrl,
                headers: { 'Content-Type': 'application/json' },
                data: payload,
                onload: function(response) {
                    if (response.status === 204) {
                        statusMsg.innerHTML = '<span style="color: #57F287;">✅ Successfully sent to Discord!</span>';
                    } else {
                        statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Error: ' + response.status + '</span>';
                    }
                },
                onerror: function() {
                    statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Failed to send. Check your webhook URL.</span>';
                }
            });
        } else {
            // Bookmarklet environment - use regular fetch
            fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            })
            .then(response => {
                if (response.status === 204) {
                    statusMsg.innerHTML = '<span style="color: #57F287;">✅ Successfully sent to Discord!</span>';
                } else {
                    statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Error: ' + response.status + '</span>';
                }
            })
            .catch(error => {
                statusMsg.innerHTML = '<span style="color: #ED4245;">❌ Failed to send. Check your webhook URL.</span>';
                console.error('Error:', error);
            });
        }
    }

    // Auto-send functionality
    function setupAutoSend() {
        const enabled = localStorage.getItem('tw_auto_send_enabled') === 'true';
        const time = localStorage.getItem('tw_auto_send_time') || '23:00';
        const webhook = localStorage.getItem('tw_discord_webhook');

        if (!enabled || !webhook) return;

        const checkAndSend = () => {
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const lastSent = localStorage.getItem('tw_last_auto_send');
            const lastSentTime = localStorage.getItem('tw_last_auto_send_time');
            const today = now.toDateString();

            if (currentTime === time && !(lastSent === today && lastSentTime === time)) {
                const lockKey = 'tw_auto_send_lock';
                const lockTime = localStorage.getItem(lockKey);
                const lockExpiry = lockTime ? parseInt(lockTime) : 0;

                if (Date.now() < lockExpiry) return;

                localStorage.setItem(lockKey, (Date.now() + 30000).toString());

                gatherStats().then(stats => {
                    if (stats.playerName === 'Unknown' || !stats.playerName) {
                        const webhookHash = webhook.split('/').pop();
                        const cacheKey = `tw_player_name_${stats.world}_${webhookHash}`;
                        const savedName = localStorage.getItem(cacheKey);
                        if (savedName) stats.playerName = savedName;
                    }

                    sendToDiscord(webhook, stats, { innerHTML: () => {} });
                    localStorage.setItem('tw_last_auto_send', today);
                    localStorage.setItem('tw_last_auto_send_time', time);
                    localStorage.removeItem(lockKey);
                });
            }
        };

        const now = new Date();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();
        const nextInterval = Math.ceil(minutes / 10) * 10;
        const minutesUntilNext = (nextInterval - minutes) % 60;
        const millisecondsUntilNext = (minutesUntilNext * 60 - seconds) * 1000 - milliseconds;

        setTimeout(() => {
            checkAndSend();
            setInterval(checkAndSend, 600000);
        }, millisecondsUntilNext);
    }

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            createStatsButton();
            setupAutoSend();
        });
    } else {
        createStatsButton();
        setupAutoSend();
    }
})();
