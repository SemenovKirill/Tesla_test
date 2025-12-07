// UI элементы из старой версии (если их нет в DOM, ничего страшного)
let connectButton = document.getElementById("connect");
let disconnectButton = document.getElementById("disconnect");
let terminalContainer = document.getElementById("terminal");
let sendForm = document.getElementById("send-form");
let inputField = document.getElementById("input");
let tryme_button = document.getElementById("try_me");

// Новый основной UI
let bigConnectBtn = document.getElementById("connect-btn");
let connectionStatusBadge = document.getElementById("connection-status");
let statusLogLine = document.getElementById("status-log");

let speedSlider = document.getElementById("speed-slider");
let speedValueDisplay = document.getElementById("speed-value");
let currentSpeed = speedSlider ? Number(speedSlider.value) || 0 : 0;
const speedThumb = document.querySelector(".speed-thumb-visual");
const speedSliderWrap = document.querySelector(".speed-slider-wrap");
const SLIDER_TRACK_INSET = 0;
const SPEED_VALUE_OFFSET = -80;
const APP_BASE_WIDTH = 1200;
const APP_BASE_HEIGHT = 780;
let appBaseHeight = null;
const logModal = document.getElementById("log-modal");
const logModalClose = document.getElementById("log-modal-close");
const logModalList = document.getElementById("log-modal-list");
const logHistory = [];

/* -----------------------------
   Старые элементы (опционально)
   ----------------------------- */

// Примерная тестовая кнопка, если существует
if (tryme_button) {
  tryme_button.addEventListener("click", function () {
    send("test");
  });
}

// Отправка формы, если такая есть
if (sendForm && inputField) {
  sendForm.addEventListener("submit", function (event) {
    event.preventDefault();
    send(inputField.value);
    inputField.value = "";
    inputField.focus();
  });
}

/* -----------------------------
   Bluetooth / GATT логика
   ----------------------------- */

let deviceCache = null;
let characteristicCache = null;
let readBuffer = "";

// Подключение к устройству
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) : requestBluetoothDevice())
    .then((device) => connectDeviceAndCacheCharacteristic(device))
    .then((characteristic) => startNotifications(characteristic))
    .catch((error) => log(error));
}

// Запрос выбора устройства
function requestBluetoothDevice() {
  log("Запуск выбора Bluetooth устройства...");

  return navigator.bluetooth
    .requestDevice({
      filters: [{ services: [0xFFE0] }],
    })
    .then((device) => {
      log('Устройство выбрано: "' + device.name + '"');
      deviceCache = device;
      deviceCache.addEventListener(
        "gattserverdisconnected",
        handleDisconnection
      );
      return deviceCache;
    });
}

// Обработчик разъединения (попытка переподключения)
function handleDisconnection(event) {
  let device = event.target;
  log(
    '"' +
      device.name +
      '" отключено, попытка переподключения...'
  );

  connectDeviceAndCacheCharacteristic(device)
    .then((characteristic) => startNotifications(characteristic))
    .catch((error) => log(error));
}

// Подключение к GATT и получение характеристики
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log("Подключение к GATT-серверу...");

  return device.gatt
    .connect()
    .then((server) => {
      log("GATT-сервер подключён, получаем сервис...");
      return server.getPrimaryService(0xFFE0);
    })
    .then((service) => {
      log("Сервис найден, получаем характеристику...");
      return service.getCharacteristic(0xFFE1);
    })
    .then((characteristic) => {
      log("Характеристика найдена, включаем уведомления...");
      characteristicCache = characteristic;
      return characteristicCache;
    });
}

// Включение уведомлений
function startNotifications(characteristic) {
  log("Запуск уведомлений...");

  return characteristic.startNotifications().then(() => {
    log("Уведомления запущены");
    characteristic.addEventListener(
      "characteristicvaluechanged",
      handleCharacteristicValueChanged
    );
  });
}

// Обработка входящих данных по строкам
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder().decode(event.target.value);

  for (let c of value) {
    if (c === "\n") {
      let data = readBuffer.trim();
      readBuffer = "";

      if (data) {
        receive(data);
      }
    } else {
      readBuffer += c;
    }
  }
}

// Получили строку от устройства
function receive(data) {
  log(data, "in");
}

// Лог: в #terminal (если есть) и кратко в #status-log
function log(data, type = "") {
  const text = String(data);
  const time = new Date().toLocaleTimeString();
  logHistory.push({ text, time });
  if (logHistory.length > 200) {
    logHistory.shift();
  }

  if (statusLogLine) {
    statusLogLine.textContent = "Лог: " + text;
  }

  renderLogHistory();

  if (!terminalContainer) return;

  terminalContainer.insertAdjacentHTML(
    "beforeend",
    '<div' + (type ? ' class="' + type + '"' : "") + ">" + text + "</div>"
  );
}

// Отключение
function disconnect() {
  if (deviceCache) {
    log('Отключаемся от "' + deviceCache.name + '"...');
    deviceCache.removeEventListener(
      "gattserverdisconnected",
      handleDisconnection
    );

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" отключено');
    } else {
      log(
        '"' +
          deviceCache.name +
          '" уже было отключено'
      );
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener(
      "characteristicvaluechanged",
      handleCharacteristicValueChanged
    );
    characteristicCache = null;
  }

  deviceCache = null;
}

/* -----------------------------
   Отправка данных
   ----------------------------- */

function send(data, options = {}) {
  const { appendNewline = true } = options;
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }

  const payload = appendNewline ? data + "\n" : data;

  if (payload.length > 20) {
    let chunks = payload.match(/(.|[\r\n]){1,20}/g);

    writeToCharacteristic(characteristicCache, chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      setTimeout(() => {
        writeToCharacteristic(characteristicCache, chunks[i]);
      }, i * 100);
    }
  } else {
    writeToCharacteristic(characteristicCache, payload);
  }

  log(payload, "out");
}

function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}

/* -----------------------------
   Привязка кнопок (data-cmd)
   ----------------------------- */

function setupControlButtons() {
  const buttons = document.querySelectorAll("[data-cmd]");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (!cmd) return;

      if (isDirection(cmd)) {
        sendDrive(cmd);
      } else {
        send(cmd);
      }
    });
  });
}

window.addEventListener("DOMContentLoaded", setupControlButtons);

/* -----------------------------
   Кнопка "Подключение Bluetooth"
   ----------------------------- */

function updateConnectButton() {
  const isConnected =
    deviceCache && deviceCache.gatt && deviceCache.gatt.connected;

  if (bigConnectBtn) {
    if (isConnected) {
      bigConnectBtn.textContent = "Отключить";
      bigConnectBtn.classList.add("connected");
    } else {
      bigConnectBtn.textContent = "Подключить";
      bigConnectBtn.classList.remove("connected");
    }
  }

  if (connectionStatusBadge) {
    if (isConnected) {
      connectionStatusBadge.textContent = "ПОДКЛЮЧЕНО";
      connectionStatusBadge.classList.add("connection-status--online");
      connectionStatusBadge.classList.remove("connection-status--offline");
    } else {
      connectionStatusBadge.textContent = "НЕ ПОДКЛЮЧЕНО";
      connectionStatusBadge.classList.add("connection-status--offline");
      connectionStatusBadge.classList.remove("connection-status--online");
    }
  }
}

if (bigConnectBtn) {
  bigConnectBtn.addEventListener("click", async () => {
    // 1 — устройства нет → ищем
    if (!deviceCache) {
      bigConnectBtn.textContent = "Поиск...";
      if (connectionStatusBadge) {
        connectionStatusBadge.textContent = "ПОИСК...";
      }

      try {
        await connect();
      } catch (e) {
        console.error(e);
      } finally {
        updateConnectButton();
      }
      return;
    }

    // 2 — устройство есть, но не подключено
    if (!deviceCache.gatt.connected) {
      bigConnectBtn.textContent = "Подключение...";
      if (connectionStatusBadge) {
        connectionStatusBadge.textContent = "ПОДКЛЮЧЕНИЕ...";
      }

      try {
        await connectDeviceAndCacheCharacteristic(deviceCache);
        await startNotifications(characteristicCache);
      } catch (e) {
        console.error(e);
      } finally {
        updateConnectButton();
      }
      return;
    }

    // 3 — уже подключено → спрашиваем, отключать ли
    const ok = confirm("Отключиться от устройства?");
    if (!ok) return;

    disconnect();
    updateConnectButton();
  });

  window.addEventListener("load", updateConnectButton);
}

/* -----------------------------
   Управление с клавиатуры (ПК)
   ----------------------------- */

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  switch (key) {
    case "arrowup":
      sendDrive("up");
      break;
    case "arrowdown":
      sendDrive("down");
      break;
    case "arrowleft":
      sendDrive("left");
      break;
    case "arrowright":
      sendDrive("right");
      break;

    case "a":
      send("A");
      break;
    case "b":
      send("B");
      break;
    case "c":
      send("C");
      break;
    case "x":
      send("X");
      break;
    case "y":
      send("Y");
      break;
    case "z":
      send("Z");
      break;
  }
}

window.addEventListener("keydown", handleKeyDown);

/* -----------------------------
   Ползунок скорости
   ----------------------------- */

function updateSpeedUI(value) {
  currentSpeed = value;
  if (speedValueDisplay) {
    speedValueDisplay.textContent = String(value);
  }
  updateThumbPosition();
}

function syncSliderHeight() {
  if (!speedSlider || !speedSliderWrap) return;
  const dpad = document.querySelector(".dpad");
  const referenceHeight = dpad ? dpad.offsetHeight : 0;
  const sliderHeight = referenceHeight || 220;

  speedSliderWrap.style.height = `${sliderHeight}px`;

  const speedPanel = document.querySelector(".panel-section--power .speed-panel");
  if (speedPanel) {
    speedPanel.style.minHeight = `${sliderHeight}px`;
  }

  updateThumbPosition();
  positionTicks();
}

function updateThumbPosition() {
  if (!speedSlider || !speedThumb || !speedSliderWrap) return;

  const min = Number(speedSlider.min) || 0;
  const max = Number(speedSlider.max) || 100;
  const val = Number(speedSlider.value) || 0;

  // значение снизу вверх
  const ratio = (max - val) / (max - min || 1);
  const trackHeight =
    speedSliderWrap.clientHeight || speedSlider.clientHeight || 0;
  const thumbHeight = speedThumb.offsetHeight || 16;
  const bubbleHeight = speedValueDisplay?.offsetHeight || 0;
  const travel = Math.max(
    trackHeight - thumbHeight - SLIDER_TRACK_INSET * 2,
    0
  );
  const offset = SLIDER_TRACK_INSET + ratio * travel;

  speedThumb.style.transform = `translate(-50%, ${offset}px)`;

  if (speedValueDisplay) {
    const bubbleOffset = offset + (thumbHeight - bubbleHeight) / 2;
    const uiScale =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--ui-scale"
        )
      ) || 1;
    const valueOffset = SPEED_VALUE_OFFSET * uiScale;
    speedValueDisplay.style.transform = `translate(calc(-50% + ${valueOffset}px), ${bubbleOffset}px)`;
  }

  positionTicks();
}

if (speedSlider) {
  const initialValue = Number(speedSlider.value);
  updateSpeedUI(Number.isFinite(initialValue) ? initialValue : 0);

  speedSlider.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    updateSpeedUI(Number.isFinite(value) ? value : 0);
  });

  syncSliderHeight();
  window.addEventListener("resize", syncSliderHeight);
  window.addEventListener("load", syncSliderHeight);
  window.addEventListener("DOMContentLoaded", syncSliderHeight);
}

if (statusLogLine) {
  statusLogLine.addEventListener("click", openLogModal);
}

if (logModalClose) {
  logModalClose.addEventListener("click", closeLogModal);
}

if (logModal) {
  logModal.addEventListener("click", (event) => {
    if (event.target === logModal) {
      closeLogModal();
    }
  });
}

if (speedSliderWrap) {
  ["touchstart", "touchmove"].forEach((evt) => {
    speedSliderWrap.addEventListener(
      evt,
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
  });

  speedSliderWrap.addEventListener(
    "wheel",
    (e) => {
      if (!speedSlider) return;
      e.preventDefault();
      const step = 5;
      const min = Number(speedSlider.min) || 0;
      const max = Number(speedSlider.max) || 255;
      const next = Math.min(
        max,
        Math.max(min, Number(speedSlider.value) - Math.sign(e.deltaY) * step)
      );
      speedSlider.value = String(next);
      updateSpeedUI(next);
    },
    { passive: false }
  );

  const handleSliderTouch = (e) => {
    if (!speedSlider) return;
    e.preventDefault();
    const touch = e.touches ? e.touches[0] : e;
    if (!touch) return;
    const rect = speedSlider.getBoundingClientRect();
    const ratio = (touch.clientY - rect.top) / rect.height;
    const min = Number(speedSlider.min) || 0;
    const max = Number(speedSlider.max) || 255;
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const value = Math.round(max - clampedRatio * (max - min));
    speedSlider.value = String(value);
    updateSpeedUI(value);
  };

  ["touchstart", "touchmove"].forEach((evt) => {
    speedSlider.addEventListener(evt, handleSliderTouch, { passive: false });
  });
}

window.addEventListener("resize", updateLayoutMode);
window.addEventListener("orientationchange", updateLayoutMode);
window.addEventListener("DOMContentLoaded", updateLayoutMode);
window.addEventListener("load", updateLayoutMode);

function positionTicks() {
  const scale = document.querySelector(".speed-scale");
  if (!scale) return;
  const ticks = scale.querySelectorAll(".speed-tick");
  if (!ticks.length) return;

  const scaleHeight = scale.clientHeight || 0;
  const thumbHeight = speedThumb?.offsetHeight || 14;
  const travel = Math.max(scaleHeight - thumbHeight, 0);
  const step = travel / (ticks.length - 1 || 1);

  ticks.forEach((tick, index) => {
    const top = thumbHeight / 2 + step * index;
    tick.style.top = `${top}px`;
  });
}

function renderLogHistory() {
  if (!logModalList) return;
  logModalList.innerHTML = "";

  logHistory
    .slice()
    .reverse()
    .forEach((item) => {
      const row = document.createElement("div");
      row.className = "log-modal-item";

      const time = document.createElement("div");
      time.className = "log-modal-item-time";
      time.textContent = item.time;

      const text = document.createElement("div");
      text.className = "log-modal-item-text";
      text.textContent = item.text;

      row.appendChild(text);
      row.appendChild(time);
      logModalList.appendChild(row);
    });
}

function openLogModal() {
  if (!logModal) return;
  renderLogHistory();
  logModal.classList.add("is-open");
}

function closeLogModal() {
  if (!logModal) return;
  logModal.classList.remove("is-open");
}

function updateLayoutMode() {
  const root = document.documentElement;
  const body = document.body;
  const appEl = document.querySelector(".app");
  const mediaLandscape = window.matchMedia("(orientation: landscape)");
  const isLandscape =
    mediaLandscape.matches || window.innerWidth > window.innerHeight;
  const viewportWidth = window.innerWidth || APP_BASE_WIDTH;
  const viewportHeight = window.innerHeight || 800;
  let scale = 1;
  if (appBaseHeight === null && appEl) {
    appBaseHeight = appEl.offsetHeight;
  }

  if (isLandscape) {
    body.classList.add("layout-landscape");
    body.classList.remove("layout-portrait");
    if (appEl) {
      const rect = appEl.getBoundingClientRect();
      const baseHeight =
        appBaseHeight || rect.height || APP_BASE_HEIGHT || viewportHeight;
      scale = Math.min(
        1,
        viewportWidth / (rect.width || APP_BASE_WIDTH),
        viewportHeight / baseHeight
      );
    }
    root.style.setProperty("--page-align", "center");
  } else {
    body.classList.add("layout-portrait");
    body.classList.remove("layout-landscape");
    if (appEl) {
      const rect = appEl.getBoundingClientRect();
      const baseHeight =
        appBaseHeight || rect.height || APP_BASE_HEIGHT || viewportHeight;
      scale = Math.min(
        1,
        viewportWidth / (rect.width || APP_BASE_WIDTH),
        viewportHeight / baseHeight
      );
    }
    root.style.setProperty("--page-align", "flex-start");
  }

  root.style.setProperty("--ui-scale", scale.toFixed(3));
  root.style.setProperty("--page-justify", "center");

  syncSliderHeight();
}

/* -----------------------------
   Команды движения
   ----------------------------- */

function isDirection(cmd) {
  return cmd === "up" || cmd === "down" || cmd === "left" || cmd === "right";
}

function buildDriveCommand(direction) {
  const speed = Math.round(Number(currentSpeed) || 0);
  let lSign = " ";
  let rSign = " ";

  switch (direction) {
    case "up":
      lSign = " ";
      rSign = " ";
      break;
    case "down":
      lSign = "-";
      rSign = "-";
      break;
    case "left":
      lSign = "-";
      rSign = " ";
      break;
    case "right":
      lSign = " ";
      rSign = "-";
      break;
    default:
      lSign = " ";
      rSign = " ";
  }

  // Формат: L±speed R±speed\r
  return `L${lSign}${speed}R${rSign}${speed}\r`;
}

function sendDrive(direction) {
  const cmd = buildDriveCommand(direction);
  send(cmd, { appendNewline: false });
}
