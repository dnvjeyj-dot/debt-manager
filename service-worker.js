const CACHE='debt-manager-shell-v9';
const ASSETS=['./','./index.html','./v9-1.b64','./v9-2.b64','./v9-3.b64','./v9-4.b64','./v9-5.b64','./v9-6.b64','./manifest.webmanifest','./icon.svg','./start.html','./diagnose.html','./beta-paid.html'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const x=r.clone();caches.open(CACHE).then(c=>c.put(e.request,x)).catch(()=>{});return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))))});
