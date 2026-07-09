/* popup.js */

const version = chrome.runtime.getManifest().version;
const LOCAL_ONLY_FIELDS = new Set(['deepseekApiKey']);
let saveStateTimeout;
document.getElementById('extensionVersion').textContent = `Ver ${version} `;

function updateBackgroundImage(isPluginOn) {
  const upperPart = document.querySelector('.upper-part');
  if (!upperPart) return;
  upperPart.classList.toggle('plugin-on', isPluginOn);
  upperPart.classList.toggle('plugin-off', !isPluginOn);
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    saveSettings();
  });

  document.getElementById('pluginSwitch').addEventListener('change', event => {
    updateBackgroundImage(event.target.checked);
  });
});

function applySettingsToForm(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const element = document.getElementById(key);
    if (!element) continue;

    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = Boolean(value);
    } else if (
      element.type === 'color' ||
      element.type === 'text' ||
      element.type === 'number' ||
      element.type === 'password' ||
      element.tagName === 'SELECT'
    ) {
      element.value = value ?? '';
    }
  }
}

function loadSettings() {
  chrome.runtime.sendMessage({ type: 'getSettings' }, settings => {
    if (chrome.runtime.lastError || !settings || settings.error) {
      chrome.storage.sync.get(null, syncSettings => {
        if (chrome.runtime.lastError) {
          console.error('[AnonTranslator] Failed to load sync settings:', chrome.runtime.lastError.message);
          showSaveState('error', 'error');
          return;
        }
        applySettingsToForm(syncSettings);
        updateBackgroundImage(Boolean(syncSettings.pluginSwitch));
      });
      return;
    }
    applySettingsToForm(settings);
    updateBackgroundImage(Boolean(settings.pluginSwitch));
  });

  chrome.storage.local.get(['deepseekApiKey'], localSettings => {
    if (chrome.runtime.lastError) {
      console.error('[AnonTranslator] Failed to load local settings:', chrome.runtime.lastError.message);
      showSaveState('error', 'error');
      return;
    }
    applySettingsToForm(localSettings);
  });
}

function getElementValue(element) {
  if (element.type === 'checkbox' || element.type === 'radio') {
    return element.checked;
  }
  if (element.type === 'number') {
    return Number.isFinite(element.valueAsNumber) ? element.valueAsNumber : '';
  }
  return element.value;
}

function showSaveState(text, className) {
  const saveButton = document.querySelector('.save');
  clearTimeout(saveStateTimeout);
  saveButton.classList.remove('saved', 'error');
  saveButton.classList.add(className);
  saveButton.textContent = text;
  saveStateTimeout = setTimeout(() => {
    saveButton.classList.remove('saved', 'error');
    saveButton.textContent = 'save';
  }, 1400);
}

function saveSettings() {
  const syncSettings = {};
  const localSettings = {};
  const elements = document.getElementById('settingsForm').elements;
  const saveButton = document.querySelector('.save');

  Array.from(elements).forEach(element => {
    if (!element.id || element.classList.contains('tab')) return;

    const target = LOCAL_ONLY_FIELDS.has(element.id) ? localSettings : syncSettings;
    const value = getElementValue(element);
    target[element.id] = LOCAL_ONLY_FIELDS.has(element.id) && typeof value === 'string'
      ? value.trim()
      : value;
  });

  saveButton.disabled = true;
  let pendingWrites = 2;
  const errors = [];
  const handleWriteComplete = areaName => {
    if (chrome.runtime.lastError) {
      errors.push(`${areaName}: ${chrome.runtime.lastError.message}`);
    }
    pendingWrites -= 1;
    if (pendingWrites === 0) {
      saveButton.disabled = false;
      if (errors.length > 0) {
        console.error('[AnonTranslator] Failed to save settings:', errors.join('; '));
        showSaveState('error', 'error');
      } else {
        showSaveState('√', 'saved');
        updateBackgroundImage(Boolean(syncSettings.pluginSwitch));
      }
    }
  };

  chrome.storage.sync.set(syncSettings, () => handleWriteComplete('sync'));
  chrome.storage.local.set(localSettings, () => handleWriteComplete('local'));
}
