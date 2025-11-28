// ==UserScript==
// @name         Mystery Inc. Dailies (Fixed Version)
// @namespace    http://tampermonkey.net/
// @version      4.7
// @description  Send daily farm, resource stats, and troop counts to Discord (Hides 0 troop counts) - fixed scheduler locks
// @author       Mystery Inc.
// @match        https://*.tribalwars.com.pt/game.php*
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.com/game.php*
// @match        https://*.tribalwars.co.uk/game.php*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// ==/UserScript==

(function(){'use strict';const _G=(()=>{try{if(typeof GM_xmlhttpRequest==='function')return GM_xmlhttpRequest}catch(e){}return null})();const _C={v:'4.7',k:{ver:'tw_script_version',wh:'tw_discord_webhook',ae:'tw_auto_send_enabled',at:'tw_auto_send_time',lk:'tw_auto_send_lock'}};const _lv=localStorage.getItem(_C.k.ver);if(_lv!==_C.v){console.log('New script version: '+_C.v+' (was: '+_lv+')');localStorage.setItem(_C.k.ver,_C.v);localStorage.removeItem(_C.k.lk)}const _sl=m=>new Promise(r=>setTimeout(r,m));function _snd(u,d){const p=JSON.stringify({embeds:[{title:'📊 Tribal Wars Daily Report',color:5814783,fields:[{name:'Player',value:d.p,inline:false},{name:'World',value:d.w,inline:false}],timestamp:new Date().toISOString(),footer:{text:'Mystery Inc Bot'}}]});return new Promise((ok,er)=>{if(_G){_G({method:'POST',url:u,headers:{'Content-Type':'application/json'},data:p,onload:ok,onerror:er})}else{fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:p}).then(ok).catch(er)}})}function _sch(){const e=localStorage.getItem(_C.k.ae)==='true',t=localStorage.getItem(_C.k.at),w=localStorage.getItem(_C.k.wh);if(!e||!t||!w)return;const f=async()=>{const n=new Date(),m=String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0');if(m!==t)return;const k=n.toDateString()+'_'+t;if(localStorage.getItem(_C.k.lk)===k)return;localStorage.setItem(_C.k.lk,k+'_P');await _sl(300);if(localStorage.getItem(_C.k.lk)!==k+'_P')return;localStorage.setItem(_C.k.lk,k);try{await _snd(w,{p:(window.game_data&&game_data.player&&game_data.player.name)||'Unknown',w:location.hostname.split('.')[0].toUpperCase()})}catch(e){console.error('[MI] Auto-send failed',e);localStorage.removeItem(_C.k.lk)}};const d=(60-new Date().getSeconds())*1e3;setTimeout(()=>{f();setInterval(f,6e4)},d)}_sch()})();
