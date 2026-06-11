self.addEventListener("push", (event) => {
  let payload = { title: "Tracker", body: "", url: "/", tag: "tracker" };
  try {
    payload = { ...payload, ...event.data?.json() };
  } catch {
    payload.body = event.data?.text() ?? "";
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Tracker", {
      body: payload.body || "",
      icon: "/icon-192.png",
      badge: "/favicon.png",
      tag: payload.tag || "tracker",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
