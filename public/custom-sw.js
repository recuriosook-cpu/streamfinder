// Glynbox custom service worker — push event handlers
// This file is imported by the Workbox-generated SW via importScripts().

self.addEventListener('push', function (event) {
  if (!event.data) return
  let data
  try { data = event.data.json() } catch { return }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Glynbox', {
      body:              data.body  || '',
      icon:              data.icon  || '/icon-192.png',
      badge:             '/icon-192.png',
      data:              { url: data.url || '/' },
      tag:               data.tag  || 'glynbox-notif',
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})
