/* global self caches fetch */

"use strict";

var coreFiles = [
  'index.html',
  'xlsx-encoder.html',
  'setup.js',
  'checkin.js',
  'xlsx-encoder.js',
  'https://cdnjs.cloudflare.com/ajax/libs/bigfishtv-turret/4.1.3/turretcss.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/tweetnacl/1.0.0/nacl-fast.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/3.2.0/fuse.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.12.9/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open('core').then(function(cache) {
      return cache.addAll(coreFiles);
    })
  );
});

// vaguely inspired by recipes like https://serviceworke.rs/strategy-cache-update-and-refresh_service-worker_doc.html

function areBodiesEqual(bodies) {
  return Promise.all(bodies.map(function(body){return body.arrayBuffer()}))
    .then(function(arrayBuffers) {
      var i, j, firstValue;
      var bufferLength = arrayBuffers[0].length;
      for (i = 1; i < arrayBuffers.length; ++i) {
        if (arrayBuffers[i] != bufferLength) return false;
      }
      for (i = 0; i < bufferLength; ++i) {
        firstValue = arrayBuffers[0][i];
        for (j = 1; j < arrayBuffers.length; ++j) {
          if (arrayBuffers[j][i] != firstValue) return false;
        }
      }
      return true;
    });
}

function announceUpdatedRequest(request) {
  return self.clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage(JSON.stringify({
        type: 'update',
        url: request.url
      }));
    });
  });
}

function doResponsesDiffer(cachedResponse, newResponse) {
  var cachedEtag = cachedResponse.headers.get('ETag');
  var newEtag = newResponse.headers.get('ETag');
  if (cachedEtag && newEtag) {
    return Promise.resolve(cachedEtag == newEtag);
  } else {
    return areBodiesEqual([cachedResponse.clone(), newResponse.clone()]);
  }
}

function checkForUpdatedResponse(request, cachedResponse, newResponse) {
  return doResponsesDiffer(cachedResponse, newResponse).then(
    function(difference) {
      if (difference) return addNewResponseToCache(request, newResponse)
        .then(function(){return announceUpdatedRequest(request)});
    });
}

function addNewResponseToCache(request, response) {
  return caches.open('core').then(function(cache) {
    return cache.put(request, response);
  });
}

// since the only thing this app ever fetches is core files,
// we handle all requests as potentially-updated and to-be-cached
self.addEventListener('fetch', function(event) {
  event.respondWith(
    Promise.all([caches.match(event.request), fetch(event.request)])
    .then(function(responses) {
      var cachedResponse = responses[0];
      var newResponse = responses[1];
      event.waitUntil(cachedResponse ?
        checkForUpdatedResponse(event.request,
          cachedResponse.clone(), newResponse.clone())
      : addNewResponseToCache(event.request, newResponse.clone()));

      return cachedResponse || newResponse;
    })
  );
});
