/* global self workbox */

"use strict";

var coreFiles = [
  'index.html',
  'xlsx-encoder.html',
  'setup.js',
  'checkin.js',
  'xlsx-encoder.js',
  'https://cdn.jsdelivr.net/npm/turretcss@4.1.3/dist/turretcss.min.css',
  'https://cdn.jsdelivr.net/npm/surpass@0.1.1/surpass.css',
  'https://cdn.jsdelivr.net/npm/surpass@0.1.1/surpass.js',
  'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.0/nacl-fast.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@3.2.0/dist/fuse.min.js',
  'https://cdn.jsdelivr.net/npm/localforage@1.7.1/dist/localforage.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.12.9/dist/shim.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.12.9/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/zxcvbn@4.4.2/dist/zxcvbn.js',
  'https://cdn.jsdelivr.net/npm/file-saver@1.3.8/FileSaver.min.js'
];

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

function announceUpdate(url) {
  return self.clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      client.postMessage({
        type: 'update',
        url: url
      });
    });
  });
}

function areResponsesEqual(cachedResponse, newResponse) {
  var cachedHeader, newHeader;

  // if one response is missing, there's no "change" (we're starting here)
  if (!cachedResponse || !newResponse) {
    return Promise.resolve(false);
  }

  // if either response is opaque / a network error
  // (the latter not being likely to be sent to this function as written)
  if (!(cachedResponse.status && newResponse.status)) {
    // this is only noteworthy if the new response isn't opaque / an error
    return Promise.resolve(!!newResponse.status);
  }

  // compare ETags or Last-Modified, if present for comparison
  cachedHeader = cachedResponse.headers.get('ETag');
  newHeader = newResponse.headers.get('ETag');
  if (cachedHeader && newHeader) {
    return Promise.resolve(cachedHeader == newHeader);
  }
  cachedHeader = cachedResponse.headers.get('Last-Modified');
  newHeader = newResponse.headers.get('Last-Modified');
  if (cachedHeader && newHeader) {
    return Promise.resolve(cachedHeader == newHeader);
  }

  // fall back to outright comparing bodies byte by byte
  // NOTE: Unless Workbox gives plugins responses from cache,
  //   it will probably be too late to clone these request bodies
  return areBodiesEqual([cachedResponse.clone(), newResponse.clone()]);
}

importScripts("https://storage.googleapis.com/workbox-cdn/releases/3.1.0/workbox-sw.js");

workbox.precaching.precache(coreFiles);

workbox.routing.setDefaultHandler(workbox.strategies.staleWhileRevalidate({
  plugins: [{
    cacheDidUpdate: function (cacheName, url, cachedResponse, newResponse) {
      return areResponsesEqual(cachedResponse, newResponse).then(
        function(unchanged) {if (!unchanged) return announceUpdate(url)});
    }
  }]
}));
