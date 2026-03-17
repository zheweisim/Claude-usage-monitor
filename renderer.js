const content = document.getElementById('content');
const footer = document.getElementById('footer');
const statusDot = document.getElementById('status-dot');

let cachedLimits = null;
let limitsError = null;

async function loadAll() {
  statusDot.className = 'titlebar-dot loading';

  // Load local data (always works)
  let usage = null;
  try {
    usage = await window.api.getUsage();
  } catch (err) {
    content.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    statusDot.className = 'titlebar-dot error';
    return;
  }

  // Load live limits (may fail/be cached)
  try {
    cachedLimits = await window.api.getLimits();
    limitsError = null;
  } catch (err) {
    limitsError = err.message;
  }

  render(usage, cachedLimits);
  footer.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  statusDot.className = 'titlebar-dot';
}

function render(data, limits) {
  const { stats, account, totals, models, projects } = data;
  let html = '';

  // -- Rate limits (top priority) --
  if (limits) {
    html += `<div class="card"><div class="card-label">Usage Limits</div>`;

    if (limits.session) {
      html += renderLimitGauge('Session (5h)', limits.session);
    }
    if (limits.weekly) {
      html += renderLimitGauge('Weekly (7d)', limits.weekly);
    }

    if (limits.overageDisabledReason) {
      const reason = limits.overageDisabledReason === 'out_of_credits' ? 'No extra usage credits' : limits.overageDisabledReason;
      html += `<div style="font-size:9px;color:#64748b;margin-top:4px">Extra usage: ${reason}</div>`;
    }

    html += `</div>`;
  } else if (limitsError) {
    html += `<div class="card"><div class="card-label">Usage Limits</div><div class="error-msg">${esc(limitsError)}</div></div>`;
  }

  content.innerHTML = html;
}

function renderLimitGauge(name, limit) {
  const pct = Math.min(limit.utilization, 100);
  const remaining = Math.max(0, 100 - pct);
  const resetTime = timeUntil(limit.resetsAt);
  const colorClass = pct < 50 ? 'low' : pct < 75 ? 'mid' : pct < 95 ? 'high' : 'full';

  return `
    <div class="limit-row">
      <div class="limit-header">
        <span class="limit-name">${name}</span>
        <span class="limit-pct">${pct.toFixed(0)}% used</span>
      </div>
      <div class="gauge-bg">
        <div class="gauge-fill ${colorClass}" style="width:${pct}%"></div>
      </div>
      <div class="limit-reset">Resets ${resetTime}</div>
    </div>`;
}

function timeUntil(ts) {
  if (!ts) return '';
  const diff = ts - Date.now();
  if (diff <= 0) return 'now';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `in ${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

function fmt(n) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// -- Refresh button --
const refreshBtn = document.getElementById('refresh-btn');
refreshBtn.addEventListener('click', () => {
  refreshBtn.classList.add('spinning');
  refreshBtn.addEventListener('animationend', () => refreshBtn.classList.remove('spinning'), { once: true });
  loadAll();
});

// -- Settings --
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const opacitySlider = document.getElementById('opacity-slider');
const opacityVal = document.getElementById('opacity-val');
const container = document.querySelector('.container');

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle('visible');
});

// Close settings when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.remove('visible');
  }
});

function applyOpacity(val) {
  const isLight = document.body.classList.contains('light');
  const containerAlpha = val / 100;
  const cardAlpha = Math.max(0.05, containerAlpha * 0.6);
  if (isLight) {
    container.style.background = `rgba(241, 245, 249, ${containerAlpha})`;
    document.querySelectorAll('.card').forEach(c => {
      c.style.background = `rgba(255, 255, 255, ${cardAlpha})`;
    });
  } else {
    container.style.background = `rgba(15, 23, 42, ${containerAlpha})`;
    document.querySelectorAll('.card').forEach(c => {
      c.style.background = `rgba(30, 41, 59, ${cardAlpha})`;
    });
  }
  opacityVal.textContent = `${val}%`;
}

opacitySlider.addEventListener('input', () => {
  applyOpacity(parseInt(opacitySlider.value));
});

opacitySlider.addEventListener('change', () => {
  window.api.saveOpacity(parseInt(opacitySlider.value));
});

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');

window.api.getTheme().then(theme => {
  if (theme === 'light') {
    document.body.classList.add('light');
    themeToggle.checked = true;
    applyOpacity(parseInt(opacitySlider.value));
  }
});

themeToggle.addEventListener('change', () => {
  if (themeToggle.checked) {
    document.body.classList.add('light');
    window.api.saveTheme('light');
  } else {
    document.body.classList.remove('light');
    window.api.saveTheme('dark');
  }
  applyOpacity(parseInt(opacitySlider.value));
});

// Auto-launch toggle
const autolaunchToggle = document.getElementById('autolaunch-toggle');

window.api.getAutoLaunch().then(enabled => {
  autolaunchToggle.checked = enabled;
});

autolaunchToggle.addEventListener('change', () => {
  window.api.setAutoLaunch(autolaunchToggle.checked);
});

// Load saved opacity
window.api.getOpacity().then(val => {
  opacitySlider.value = val;
  opacityVal.textContent = `${val}%`;
  applyOpacity(val);
});

// Re-apply opacity after renders (since innerHTML replaces cards)
const origRender = render;
render = function(data, limits) {
  origRender(data, limits);
  applyOpacity(parseInt(opacitySlider.value));
};

// -- Init --
loadAll();

// Refresh limits every 5 minutes, local data every 30s
setInterval(loadAll, 300_000);
setInterval(async () => {
  try {
    const usage = await window.api.getUsage();
    render(usage, cachedLimits);
    footer.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch {}
}, 30_000);

window.api.onRefresh(() => loadAll());
