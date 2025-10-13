// tracking-ui.js
(async function(){
  const API = "http://localhost:5000"; // same origin; we use absolute fetch below
  const params = new URLSearchParams(window.location.search);
  const trackingNumber = params.get("number") || params.get("tracking") || params.get("id");

  // load navbar/footer if used by your site
  async function loadComponent(id, file) {
    try {
      const res = await fetch(file);
      if (!res.ok) return;
      const html = await res.text();
      document.getElementById(id).innerHTML = html;
    } catch (e) { /* ignore */ }
  }
  loadComponent('navbar','/navbar.html');
  loadComponent('footer','/footer.html');

  // simple helper to set text by id
  function set(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }

  // fallback UI when no tracking number
  if(!trackingNumber){
    document.querySelector('.container').innerHTML = '<div class="card"><h3>No tracking number provided in the URL.</h3><p>Use ?number=YOUR_TRACKING_NUMBER</p></div>';
    return;
  }

  set('trackNumber', trackingNumber);

  // fetch data
  try{
    const res = await fetch(`/api/tracking/${encodeURIComponent(trackingNumber)}`);
    const data = await res.json();

    if(!res.ok){
      // show friendly error
      document.querySelector('.container').innerHTML = `
        <div class="card"><h3>Tracking not found</h3><p>${data.message || 'Could not find parcel.'}</p></div>`;
      return;
    }

    // fill UI elements
    const status = data.status || "Pending";
    set('statusPill', status);
    set('expectedDelivery', data.expectedDelivery ? `ETA: ${new Date(data.expectedDelivery).toLocaleDateString()}` : 'ETA: Not set');
    set('originVal', data.origin || 'N/A');
    set('currentVal', data.location || 'N/A');
    set('destVal', data.destination || 'N/A');

    // compute cost (try items sum)
    const items = Array.isArray(data.items) ? data.items : [];
    const totalCost = items.reduce((s,it) => s + (parseFloat(it.cost)||0)*(parseInt(it.quantity)||1), 0);
    set('costVal', totalCost ? `$${totalCost.toFixed(2)}` : '—');

    // progress logic: if updates exist compute percent by index; otherwise map status
    const updates = Array.isArray(data.updates) ? data.updates : [];
    let progressPct = 0;
    if(updates.length>0){
      // newer updates at end -> index mapping
      const lastIndex = updates.length - 1;
      progressPct = Math.round(((lastIndex + 1) / Math.max(updates.length, 4)) * 100);
      if(progressPct > 98) progressPct = 95; // leave room for delivered
    } else {
      const map = { 'Pending':10, 'Collected':20, 'Dispatched':40, 'In Transit':65, 'Out for Delivery':85, 'Delivered':100 };
      progressPct = map[status] || 10;
    }
    if(status === 'Delivered') progressPct = 100;
    document.getElementById('progressFill').style.width = progressPct + '%';
    document.getElementById('progressPercent').textContent = progressPct + '%';

    // barcode area (use JsBarcode)
    try{
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, trackingNumber, { format: 'CODE128', width:1.6, height:36, displayValue: true });
      const area = document.getElementById('barcodeArea');
      area.innerHTML = '';
      area.appendChild(canvas);
    }catch(e){ /* ignore */ }

    // TIMELINE
    const timelineList = document.getElementById('timelineList');
    timelineList.innerHTML = '';
    if(updates.length === 0){
      timelineList.innerHTML = '<li class="muted">No tracking history available yet.</li>';
    } else {
      // sort oldest -> newest
      updates.sort((a,b)=> new Date(a.timestamp) - new Date(b.timestamp));
      updates.forEach(u=>{
        const time = u.timestamp ? new Date(u.timestamp).toLocaleString() : '';
        const li = document.createElement('li');
        li.innerHTML = `<strong>${time}</strong><div>${u.location || 'Unknown location'} — ${u.status || ''}</div>`;
        timelineList.appendChild(li);
      });
    }

    // ITEMS
    const itemsList = document.getElementById('itemsList');
    itemsList.innerHTML = '';
    if(items.length===0){
      itemsList.innerHTML = '<p class="muted">No items available.</p>';
    } else {
      items.forEach(it=>{
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
          <div>
            <div style="font-weight:700">${it.name || 'Item'}</div>
            <div style="font-size:0.9rem;color:#6b7280">${it.description || ''}</div>
          </div>
          <div style="text-align:right">
            <div>${it.quantity || 1} × ${(it.cost !== undefined) ? ('$' + (Number(it.cost)||0).toFixed(2)) : '-'}</div>
            <div style="font-weight:700">${it.quantity ? '$'+((Number(it.cost)||0)*(Number(it.quantity)||1)).toFixed(2) : ''}</div>
          </div>`;
        itemsList.appendChild(row);
      });
    }

    // MAP - try to show a route; if sender/receiver have lat/lng use them; else attempt geocoding by name (not included)
    const mapEl = document.getElementById('map');
    // create map
    const map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([20,0], 2);

    // tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom: 18
    }).addTo(map);

    // We'll attempt to parse coordinates if provided in data (e.g. originCoords, destinationCoords)
    // Accept: sender.coords = {lat, lng} or receiver.coords
    const points = [];
    if(data.sender && data.sender.coords && data.sender.coords.lat && data.sender.coords.lng){
      points.push([data.sender.coords.lat, data.sender.coords.lng]);
      L.marker([data.sender.coords.lat, data.sender.coords.lng]).addTo(map).bindPopup('Origin');
    }
    if(data.receiver && data.receiver.coords && data.receiver.coords.lat && data.receiver.coords.lng){
      points.push([data.receiver.coords.lat, data.receiver.coords.lng]);
      L.marker([data.receiver.coords.lat, data.receiver.coords.lng]).addTo(map).bindPopup('Destination');
    }
    // if no coords but origin/destination are strings, still set a center
    if(points.length === 0){
      // try to center on approximate lat for current location (not possible without geocode); fallback center
      map.setView([20,0], 2);
      // put optional marker at 0,0? skip.
    } else {
      // draw polyline
      const poly = L.polyline(points, { color: '#ffb703', weight: 5, opacity:0.9, dashArray: '' }).addTo(map);
      map.fitBounds(poly.getBounds(), { padding: [40,40] });
    }

    // wire invoice button: call global generateInvoice if available
    document.getElementById('invoiceBtn').addEventListener('click', (e)=>{
      if (typeof window.generateInvoice === 'function') {
        // let your invoice function use the last fetched data if it expects a global var;
        window.latestTrackingData = data;
        window.generateInvoice();
      } else {
        alert('Invoice generator is not available. If you want PDF invoice, add the generateInvoice() script to your page.');
      }
    });

  }catch(err){
    console.error('Tracking fetch error', err);
    document.querySelector('.container').innerHTML = `<div class="card"><h3>Error loading tracking information</h3><p class="muted">${err.message||''}</p></div>`;
  }
})();
