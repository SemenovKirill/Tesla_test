// companion.js
(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  // Берём путь к SW из data-атрибута скрипта <script src="companion.js" data-service-worker="sw.js">
  function getServiceWorkerPath() {
    try {
      const currentScript =
        document.currentScript ||
        Array.from(document.getElementsByTagName("script")).find(function (s) {
          return /companion\.js($|\?)/.test(s.src);
        });

      if (currentScript && currentScript.dataset.serviceWorker) {
        return currentScript.dataset.serviceWorker;
      }
    } catch (e) {
      // игнорируем, вернём значение по умолчанию
    }
    return "sw.js";
  }

  const swPath = getServiceWorkerPath();

  window.addEventListener("load", function () {
    navigator.serviceWorker
      .register(swPath)
      .then(function (reg) {
        console.log("[SW] Зарегистрирован:", reg.scope);
      })
      .catch(function (err) {
        console.error("[SW] Ошибка регистрации:", err);
      });
  });
})();