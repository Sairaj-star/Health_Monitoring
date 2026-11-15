const DEFAULT_CONFIG = {
  channelId: "3579817",
  readApiKey: "RAU500VB9K5WTQ79",
  intervalMs: 15000
};

const STORAGE_KEY = "health_monitor_3579817_cfg";
let pollTimer = null;

function getConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return { ...DEFAULT_CONFIG, ...(saved || {}) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function renderCharts(cfg) {
  const grid = document.getElementById("chartsGrid");
  const keyQuery = cfg.readApiKey ? `&api_key=${encodeURIComponent(cfg.readApiKey)}` : "";
  const charts = [
    { field: 1, title: "Field 1: Heart Rate (BPM)", color: "dc2626" },
    { field: 2, title: "Field 2: Blood Oxygen SpO2 (%)", color: "0284c7" },
    { field: 3, title: "Field 3: ECG Waveform", color: "7c3aed" },
    { field: 4, title: "Field 4: Body Temperature (°C)", color: "d97706" }
  ];

  grid.innerHTML = charts.map((c) => `
    <div class="chart-card">
      <h3>${c.title}</h3>
      <iframe
        class="chart-frame"
        title="${c.title}"
        src="https://thingspeak.com/channels/${encodeURIComponent(cfg.channelId)}/charts/${c.field}?bgcolor=%23ffffff&color=%23${c.color}&dynamic=true&results=30&type=line${keyQuery}">
      </iframe>
    </div>
  `).join("");
}

function checkVitals(hr, spo2, temp) {
  const alerts = [];
  if (!isNaN(hr) && (hr < 60 || hr > 100)) alerts.push(`Abnormal Heart Rate (${Math.round(hr)} BPM)`);
  if (!isNaN(spo2) && spo2 < 95) alerts.push(`Low SpO2 (${Math.round(spo2)}%)`);
  if (!isNaN(temp) && (temp < 36.1 || temp > 37.8)) alerts.push(`Abnormal Temperature (${temp.toFixed(1)} °C)`);
  return alerts;
}

function updateBadge(el, val, isAlert, customOkText = "Normal") {
  if (isNaN(val)) {
    el.textContent = "No Data";
    el.className = "badge badge-wait";
    return;
  }
  el.textContent = isAlert ? "Alert" : customOkText;
  el.className = "badge " + (isAlert ? "badge-alert" : "badge-ok");
}

async function fetchThingSpeakData() {
  const cfg = getConfig();
  const syncEl = document.getElementById("syncStatus");
  const channelEl = document.getElementById("channelStatus");
  const liveDot = document.getElementById("liveDot");

  channelEl.textContent = `Channel #${cfg.channelId}`;
  syncEl.textContent = "Syncing...";

  const base = `https://api.thingspeak.com/channels/${encodeURIComponent(cfg.channelId)}/feeds.json?results=10`;
  const url = cfg.readApiKey ? `${base}&api_key=${encodeURIComponent(cfg.readApiKey)}` : base;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const feeds = data.feeds || [];

    liveDot.classList.add("online");
    if (data.channel && data.channel.name) {
      channelEl.textContent = `${data.channel.name} (#${cfg.channelId})`;
    }

    if (feeds.length === 0) {
      syncEl.textContent = "Connected (Waiting for ESP32 data)";
      document.getElementById("logTableBody").innerHTML =
        `<tr><td colspan="7">Channel #${cfg.channelId} is connected, but no sensor readings have been uploaded yet.</td></tr>`;
      return;
    }

    // Latest entry is last in array
    const latest = feeds[feeds.length - 1];
    const hr = parseFloat(latest.field1);
    const spo2 = parseFloat(latest.field2);
    const ecg = parseFloat(latest.field3);
    const temp = parseFloat(latest.field4);

    document.getElementById("hrVal").textContent = isNaN(hr) ? "--" : Math.round(hr);
    document.getElementById("spo2Val").textContent = isNaN(spo2) ? "--" : Math.round(spo2);
    document.getElementById("ecgVal").textContent = isNaN(ecg) ? "--" : Math.round(ecg);
    document.getElementById("tempVal").textContent = isNaN(temp) ? "--" : temp.toFixed(1);

    updateBadge(document.getElementById("hrBadge"), hr, hr < 60 || hr > 100);
    updateBadge(document.getElementById("spo2Badge"), spo2, spo2 < 95);
    updateBadge(document.getElementById("ecgBadge"), ecg, false, "Active");
    updateBadge(document.getElementById("tempBadge"), temp, temp < 36.1 || temp > 37.8);

    // Alert Banner
    const activeAlerts = checkVitals(hr, spo2, temp);
    const banner = document.getElementById("alertBanner");
    if (activeAlerts.length > 0) {
      banner.style.display = "block";
      banner.textContent = "PATIENT HEALTH ALERT: " + activeAlerts.join(" | ");
    } else {
      banner.style.display = "none";
    }

    // Populate Table (newest first)
    const tbody = document.getElementById("logTableBody");
    tbody.innerHTML = "";
    [...feeds].reverse().forEach((item) => {
      const f1 = parseFloat(item.field1);
      const f2 = parseFloat(item.field2);
      const f3 = parseFloat(item.field3);
      const f4 = parseFloat(item.field4);
      const rowAlerts = checkVitals(f1, f2, f4);

      const timeFormatted = new Date(item.created_at).toLocaleString([], {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>#${item.entry_id}</td>
        <td>${timeFormatted}</td>
        <td>${isNaN(f1) ? "--" : Math.round(f1)}</td>
        <td>${isNaN(f2) ? "--" : Math.round(f2)}</td>
        <td>${isNaN(f3) ? "--" : Math.round(f3)}</td>
        <td>${isNaN(f4) ? "--" : f4.toFixed(1)}</td>
        <td><span class="badge ${rowAlerts.length ? "badge-alert" : "badge-ok"}">${rowAlerts.length ? "Alert" : "Normal"}</span></td>
      `;
      tbody.appendChild(tr);
    });

    const lastTime = new Date(latest.created_at).toLocaleTimeString();
    syncEl.textContent = `Last updated: ${lastTime}`;
  } catch (err) {
    liveDot.classList.remove("online");
    syncEl.textContent = "Sync Failed (Check Public Sharing / Read API Key)";
    console.error("ThingSpeak Error:", err);
  }
}

function initApp() {
  const cfg = getConfig();
  document.getElementById("channelIdInput").value = cfg.channelId;
  document.getElementById("apiKeyInput").value = cfg.readApiKey;
  document.getElementById("intervalSelect").value = String(cfg.intervalMs);

  renderCharts(cfg);
  fetchThingSpeakData();

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchThingSpeakData, cfg.intervalMs);
}

// UI Event Listeners
document.getElementById("toggleSettingsBtn").addEventListener("click", () => {
  const panel = document.getElementById("settingsPanel");
  panel.hidden = !panel.hidden;
});

document.getElementById("refreshBtn").addEventListener("click", fetchThingSpeakData);

document.getElementById("configForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const updated = {
    channelId: document.getElementById("channelIdInput").value.trim() || "3579817",
    readApiKey: document.getElementById("apiKeyInput").value.trim(),
    intervalMs: Number(document.getElementById("intervalSelect").value) || 15000
  };
  saveConfig(updated);
  document.getElementById("settingsPanel").hidden = true;
  initApp();
});

document.getElementById("resetDefaultBtn").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  initApp();
});

initApp();