const CACHE_NAME = "fintracker-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json"
];

self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(CACHE_NAME)
        .then(
          cache =>
            cache.addAll(APP_SHELL)
        )
    );

    self.skipWaiting();
  }
);


self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      caches
        .keys()
        .then(keys => {

          return Promise.all(
            keys
              .filter(
                key =>
                  key !== CACHE_NAME
              )
              .map(
                key =>
                  caches.delete(key)
              )
          );
        })
    );

    self.clients.claim();
  }
);


self.addEventListener(
  "fetch",
  event => {

    if (
      event.request.method !== "GET"
    ) {
      return;
    }

    /*
      Сначала сеть.

      Это особенно важно для app.js,
      styles.css и index.html:
      новая версия должна попадать
      в приложение сразу после деплоя.

      После успешного запроса ответ
      обновляет cache.

      При отсутствии сети используем
      старый cache.
    */

    event.respondWith(
      fetch(event.request)
        .then(response => {

          const copy =
            response.clone();

          caches
            .open(CACHE_NAME)
            .then(cache => {
              cache.put(
                event.request,
                copy
              );
            });

          return response;
        })
        .catch(() => {
          return caches.match(
            event.request
          );
        })
    );
  }
);