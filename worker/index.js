// Glynbox custom service worker chunk — compiled by @ducanh2912/next-pwa
// and injected into the generated SW via importScripts().

self.addEventListener('push', function (event) {
  if (!event.data) return
  var data
  try { data = event.data.json() } catch (e) { return }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Glynbox', {
      body:               data.body  || '',
      icon:               data.icon  || '/icon-192.png',
      badge:              '/icon-192.png',
      data:               { url: data.url || '/' },
      tag:                data.tag   || 'glynbox-notif',
      requireInteraction: false,
    })
  )
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var url = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i]
        if (client.url === url && 'focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})
