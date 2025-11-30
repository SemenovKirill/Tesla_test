// Получение ссылок на элементы UI
let connectButton = document.getElementById('connect');
let disconnectButton = document.getElementById('disconnect');
let terminalContainer = document.getElementById('terminal');
let sendForm = document.getElementById('send-form');
let inputField = document.getElementById('input');

let tryme_button = document.getElementById('try_me');
let bigConnectBtn = document.getElementById("connect-btn");
let speedSlider = document.getElementById("speed-slider");
let speedValueDisplay = document.getElementById("speed-value");
let currentSpeed = speedSlider ? Number(speedSlider.value) || 0 : 0;



/*
// Подключение к устройству при нажатии на кнопку Connect
connectButton.addEventListener('click', function() {
  connect();
});

// Отключение от устройства при нажатии на кнопку Disconnect
disconnectButton.addEventListener('click', function() {
  disconnect();
});
*/

if (tryme_button) {
  tryme_button.addEventListener('click', function() {
    send('test');
  });
}


// Обработка события отправки формы
if (sendForm && inputField) {
  sendForm.addEventListener('submit', function(event) {
    event.preventDefault(); // Предотвратить отправку формы
    send(inputField.value); // Отправить содержимое текстового поля
    inputField.value = '';  // Обнулить текстовое поле
    inputField.focus();     // Вернуть фокус на текстовое поле
  });
}

// Кэш объекта выбранного устройства
let deviceCache = null;

// Кэш объекта характеристики
let characteristicCache = null;

// Промежуточный буфер для входящих данных
let readBuffer = '';

// Запустить выбор Bluetooth устройства и подключиться к выбранному
function connect() {
  return (deviceCache ? Promise.resolve(deviceCache) :
      requestBluetoothDevice()).
      then(device => connectDeviceAndCacheCharacteristic(device)).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Запрос выбора Bluetooth устройства
function requestBluetoothDevice() {
  log('Requesting bluetooth device...');

  return navigator.bluetooth.requestDevice({
    filters: [{services: [0xFFE0]}],
  }).
      then(device => {
        log('"' + device.name + '" bluetooth device selected');
        deviceCache = device;
        deviceCache.addEventListener('gattserverdisconnected',
            handleDisconnection);

        return deviceCache;
      });
}

// Обработчик разъединения
function handleDisconnection(event) {
  let device = event.target;

  log('"' + device.name +
      '" bluetooth device disconnected, trying to reconnect...');

  connectDeviceAndCacheCharacteristic(device).
      then(characteristic => startNotifications(characteristic)).
      catch(error => log(error));
}

// Подключение к определенному устройству, получение сервиса и характеристики
function connectDeviceAndCacheCharacteristic(device) {
  if (device.gatt.connected && characteristicCache) {
    return Promise.resolve(characteristicCache);
  }

  log('Connecting to GATT server...');

  return device.gatt.connect().
      then(server => {
        log('GATT server connected, getting service...');

        return server.getPrimaryService(0xFFE0);
      }).
      then(service => {
        log('Service found, getting characteristic...');

        return service.getCharacteristic(0xFFE1);
      }).
      then(characteristic => {
        log('Characteristic found');
        characteristicCache = characteristic;

        return characteristicCache;
      });
}

// Включение получения уведомлений об изменении характеристики
function startNotifications(characteristic) {
  log('Starting notifications...');

  return characteristic.startNotifications().
      then(() => {
        log('Notifications started');
        characteristic.addEventListener('characteristicvaluechanged',
            handleCharacteristicValueChanged);
      });
}

// Получение данных
function handleCharacteristicValueChanged(event) {
  let value = new TextDecoder().decode(event.target.value);

  for (let c of value) {
    if (c === '\n') {
      let data = readBuffer.trim();
      readBuffer = '';

      if (data) {
        receive(data);
      }
    }
    else {
      readBuffer += c;
    }
  }
}

// Обработка полученных данных
function receive(data) {
  log(data, 'in');
}

// Вывод в терминал
function log(data, type = '') {
  if (!terminalContainer) return;
  terminalContainer.insertAdjacentHTML(
    'beforeend',
    '<div' + (type ? ' class="' + type + '"' : '') + '>' + data + '</div>'
  );
}

// Отключиться от подключенного устройства
function disconnect() {
  if (deviceCache) {
    log('Disconnecting from "' + deviceCache.name + '" bluetooth device...');
    deviceCache.removeEventListener('gattserverdisconnected',
        handleDisconnection);

    if (deviceCache.gatt.connected) {
      deviceCache.gatt.disconnect();
      log('"' + deviceCache.name + '" bluetooth device disconnected');
    }
    else {
      log('"' + deviceCache.name +
          '" bluetooth device is already disconnected');
    }
  }

  if (characteristicCache) {
    characteristicCache.removeEventListener('characteristicvaluechanged',
        handleCharacteristicValueChanged);
    characteristicCache = null;
  }

  deviceCache = null;
}

// Отправить данные подключенному устройству
function send(data) {
  data = String(data);

  if (!data || !characteristicCache) {
    return;
  }

  data += '\n';

  if (data.length > 20) {
    let chunks = data.match(/(.|[\r\n]){1,20}/g);

    writeToCharacteristic(characteristicCache, chunks[0]);

    for (let i = 1; i < chunks.length; i++) {
      setTimeout(() => {
        writeToCharacteristic(characteristicCache, chunks[i]);
      }, i * 100);
    }
  }
  else {
    writeToCharacteristic(characteristicCache, data);
  }

  log(data, 'out');
}

// Записать значение в характеристику
function writeToCharacteristic(characteristic, data) {
  characteristic.writeValue(new TextEncoder().encode(data));
}



/* ================================
   Подключение D-Pad и Buttons
   ================================ */

// D-pad и кнопки действий должны иметь атрибут data-cmd="команда"
// Например: <button class="dpad-btn" data-cmd="up">▲</button>

function setupControlButtons() {
  // Все элементы, содержащие data-cmd
  const buttons = document.querySelectorAll("[data-cmd]");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (cmd) {
        send(cmd);  // Используем существующую функцию send()
      }
    });
  });
}

// Запускаем после загрузки страницы
window.addEventListener("DOMContentLoaded", setupControlButtons);


/* ================================
   Кнопка "Подключение Bluetooth"
   ================================ */

function updateConnectButton() {
  if (deviceCache && deviceCache.gatt && deviceCache.gatt.connected) {
    bigConnectBtn.textContent = "Подключено";
    bigConnectBtn.classList.add("connected");
  } else {
    bigConnectBtn.textContent = "Подключить Bluetooth";
    bigConnectBtn.classList.remove("connected");
  }
}

bigConnectBtn.addEventListener("click", async () => {

  // 1 — нет устройства → запрашиваем устройство
  if (!deviceCache) {
    bigConnectBtn.textContent = "Поиск...";
    try {
      await connect();
      updateConnectButton();
    } catch (e) {
      console.error(e);
      updateConnectButton();
    }
    return;
  }

  // 2 — устройство есть, но НЕ подключено
  if (!deviceCache.gatt.connected) {
    bigConnectBtn.textContent = "Подключение...";
    try {
      await connectDeviceAndCacheCharacteristic(deviceCache);
      await startNotifications(characteristicCache);
      updateConnectButton();
    } catch (e) {
      console.error(e);
      updateConnectButton();
    }
    return;
  }

  // 3 — подключено → спрашиваем подтверждение
  const ok = confirm("Отключиться от устройства?");
  if (!ok) return;

  disconnect();
  updateConnectButton();
});

// После загрузки страницы
window.addEventListener("load", updateConnectButton);


/* ================================
   Управление с клавиатуры (ПК)
   ================================ */

function handleKeyDown(event) {
  const key = event.key.toLowerCase();

  switch (key) {
    case "arrowup":
      send("up");
      break;
    case "arrowdown":
      send("down");
      break;
    case "arrowleft":
      send("left");
      break;
    case "arrowright":
      send("right");
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


/* ================================
   Ползунок скорости
   ================================ */

function updateSpeedUI(value) {
  currentSpeed = value;
  if (speedValueDisplay) {
    speedValueDisplay.textContent = String(value);
  }
}

function syncSliderHeight() {
  if (!speedSlider) return;
  const dpad = document.querySelector(".dpad");
  if (!dpad) return;
  const height = dpad.offsetHeight;
  if (!height) return;
  speedSlider.style.height = `${height}px`;
  const speedPanel = document.querySelector(".speed-panel");
  if (speedPanel) {
    speedPanel.style.height = `${height}px`;
  }
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
