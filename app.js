// --- DATABASE & MAP INITIALIZATION ---
let db; 

const map = L.map('map').setView([33.8, -118.0], 10);
L.tileLayer('https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=xzW3zqFAhBFSjDCyei9e', {
    attribution: '<a href="https://www.maptiler.com/copyright/">MapTiler</a>',
    tileSize: 512, zoomOffset: -1, minZoom: 0
}).addTo(map);

// --- HQ CUSTOM MARKER ---
const hqLatLng = [33.74418, -118.02821]; // Stored as a variable for distance math later
const hqIcon = L.icon({
    iconUrl: 'hq-logo.png', 
    iconSize: [26, 26],     
    iconAnchor: [13, 13],   
    popupAnchor: [0, -13],  
    className: 'hq-custom-icon' 
});

const hqMarker = L.marker(hqLatLng, {
    icon: hqIcon,
    zIndexOffset: 1000 
}).addTo(map);
hqMarker.bindPopup('<b>Our Headquarters</b><br>5762 Bolsa Ave<br>Huntington Beach, CA');

const searchLayer = L.layerGroup().addTo(map);
const savedLayer = L.layerGroup().addTo(map);

let savedBusinesses = [];
let currentSearchResults = []; 

// --- TAB SWITCHING LOGIC ---
document.getElementById('tab-search').addEventListener('click', () => switchTab('search'));
document.getElementById('tab-saved').addEventListener('click', () => {
    switchTab('saved');
    renderSavedSidebar(); 
});

function switchTab(tab) {
    document.getElementById('tab-search').classList.toggle('active', tab === 'search');
    document.getElementById('tab-saved').classList.toggle('active', tab === 'saved');
    document.getElementById('view-search').style.display = tab === 'search' ? 'block' : 'none';
    document.getElementById('view-saved').style.display = tab === 'saved' ? 'block' : 'none';
    
    if (tab === 'saved') {
        searchLayer.clearLayers(); 
    }
}

// --- DATABASE FUNCTIONS ---
async function fetchSavedBusinesses() {
    const { data, error } = await db.from('saved_businesses').select('*');
    if (!error) {
        savedBusinesses = data || [];
        renderSavedMarkersGlobally(); 
        
        if (document.getElementById('view-saved').style.display === 'block') {
            renderSavedSidebar();
        }
    }
}

function renderSavedMarkersGlobally() {
    savedLayer.clearLayers();
    savedBusinesses.forEach(prospect => {
        const markerClass = prospect.status === 'Interested' ? 'marker-interested' : 'marker-client';
        
        const marker = L.marker([prospect.lat, prospect.lng], {
            place_id: prospect.place_id, 
            icon: L.divIcon({
                html: `<div style="background-color: white; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" class="${markerClass}"><div style="background-color: black; width: 6px; height: 6px; border-radius: 50%;"></div></div>`,
                className: ''
            })
        }).bindTooltip(`${prospect.name} (${prospect.status})`, { direction: 'top', offset: [0, -10], className: 'custom-tooltip' });
        
        marker.bindPopup(`<strong style="color: black;">${prospect.name}</strong><br/><span style="color: #444;">Status: ${prospect.status}</span>`);
        
        savedLayer.addLayer(marker);
    });
}

async function saveBusiness(prospect, status, buttonElement, details = null) {
    buttonElement.innerText = "Saving...";
    
    const { error } = await db.from('saved_businesses').upsert({
        place_id: prospect.place_id,
        name: prospect.name,
        status: status,
        lat: prospect.lat, 
        lng: prospect.lng,
        phone: details?.nationalPhoneNumber || null,
        website: details?.websiteUri || null,
        rating: details?.rating ? details.rating.toString() : null
    }, { onConflict: 'place_id' });

    if (error) {
        console.error("Save Error:", error);
        buttonElement.innerText = "Error!";
    } else {
        buttonElement.innerText = "Saved ✓";
        
        searchLayer.eachLayer(layer => {
            if (layer.options.place_id === prospect.place_id) {
                searchLayer.removeLayer(layer);
            }
        });
        
        await fetchSavedBusinesses(); 
    }
}

async function deleteSavedBusiness(placeId, buttonElement) {
    buttonElement.innerText = "Removing...";
    const { error } = await db.from('saved_businesses').delete().eq('place_id', placeId);

    if (error) {
        console.error("Delete Error:", error);
        buttonElement.innerText = "Error!";
    } else {
        await fetchSavedBusinesses(); 
    }
}

// --- CORE RENDER FUNCTION FOR SIDEBAR CARDS ---
function createSidebarCard(prospect, containerId, isSaved = false) {
    const isAlreadySaved = savedBusinesses.some(b => b.place_id === prospect.place_id);
    let marker;

    if (isAlreadySaved || isSaved) {
        savedLayer.eachLayer(layer => {
            if (layer.options.place_id === prospect.place_id) marker = layer;
        });
    } else {
        marker = L.marker([prospect.lat, prospect.lng], {
            place_id: prospect.place_id, 
            icon: L.divIcon({
                html: `<div style="background-color: white; width: 16px; height: 16px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" class="marker-search"><div style="background-color: black; width: 6px; height: 6px; border-radius: 50%;"></div></div>`,
                className: ''
            })
        }).bindTooltip(prospect.name, { direction: 'top', offset: [0, -10], className: 'custom-tooltip' });
        
        searchLayer.addLayer(marker);
    }

    const cardNameDisplay = prospect.displayName || prospect.name;
    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `<div class="card-header">${cardNameDisplay}</div><div class="card-body" style="display:none;">Loading...</div>`;

    const toggleCardAndMarker = (active) => {
        card.classList.toggle('active', active);
        if (marker && marker.getElement()) {
            const dot = marker.getElement().querySelector('div');
            if (dot) {
                if (active) dot.classList.add('marker-glow');
                else dot.classList.remove('marker-glow');
            }
        }
    };

    card.addEventListener('mouseover', () => toggleCardAndMarker(true));
    card.addEventListener('mouseout', () => toggleCardAndMarker(false));
    
    if (marker) {
        marker.on('mouseover', () => toggleCardAndMarker(true));
        marker.on('mouseout', () => toggleCardAndMarker(false));
    }

    const handleDetails = async () => {
        const body = card.querySelector('.card-body');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        if (body.style.display === 'block') { body.style.display = 'none'; return; }
        body.style.display = 'block';

        if (body.innerText === 'Loading...') {
            try {
                const { data: details, error } = await db.functions.invoke('get-place-details', { body: { placeId: prospect.place_id } });
                if (error) throw error;

                const phone = details?.nationalPhoneNumber || 'No phone provided';
                const website = details?.websiteUri || '#';
                const rating = details?.rating ? `⭐ ${details.rating}` : 'No rating';
                
                const websiteHTML = website !== '#' ? `<a href="${website}" target="_blank" style="color: var(--accent);">Visit Website</a>` : `<span>No website</span>`;

                let deleteBtnHTML = (isAlreadySaved || isSaved) 
                    ? `<button class="save-btn btn-delete" style="background-color: #ff4d4d; color: white;">Remove</button>` 
                    : '';

                body.innerHTML = `
                    <div style="color: var(--text-light); margin-bottom: 10px;">${rating}<br>📞 ${phone}</div>
                    ${websiteHTML}
                    <div class="action-btns">
                        <button class="save-btn btn-interested">Interested</button>
                        <button class="save-btn btn-client">Client</button>
                        ${deleteBtnHTML}
                    </div>
                `;

                body.querySelector('.btn-interested').addEventListener('click', (e) => saveBusiness(prospect, 'Interested', e.target, details));
                body.querySelector('.btn-client').addEventListener('click', (e) => saveBusiness(prospect, 'Client', e.target, details));
                
                if (isAlreadySaved || isSaved) {
                    body.querySelector('.btn-delete').addEventListener('click', (e) => deleteSavedBusiness(prospect.place_id, e.target));
                }
            } catch (err) {
                body.innerHTML = `<p style="color: #ff6b6b;">Failed to load details.</p>`;
            }
        }
    };

    if (marker) marker.on('click', handleDetails);
    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('save-btn')) handleDetails();
    });
    
    document.getElementById(containerId).appendChild(card);
}

function renderSavedSidebar() {
    const container = document.getElementById('saved-container');
    container.innerHTML = ''; 
    
    if (savedBusinesses.length === 0) {
        container.innerHTML = '<p style="color:#888;">No saved businesses yet.</p>';
        return;
    }

    const sorted = [...savedBusinesses].sort((a, b) => a.status.localeCompare(b.status));

    sorted.forEach(p => {
        const badgeColor = p.status === 'Interested' ? '#ffaa00' : p.status === 'Contacted' ? '#007bff' : '#00cc66';
        p.displayName = `${p.name} <span style="font-size: 0.7em; padding: 2px 6px; margin-left: 6px; border-radius: 4px; background: ${badgeColor}; color: ${p.status === 'Contacted' ? '#fff' : '#000'}; font-weight: bold;">${p.status}</span>`;
        createSidebarCard(p, 'saved-container', true);
    });
}

// --- BULK SAVE LOGIC & UI INJECTION ---
const bulkActionsDiv = document.createElement('div');
bulkActionsDiv.id = 'bulk-actions';
bulkActionsDiv.style.display = 'none';
bulkActionsDiv.style.gap = '10px';
bulkActionsDiv.style.margin = '15px 0';
bulkActionsDiv.innerHTML = `
    <button id="save-all-interested" class="save-btn btn-interested" style="flex: 1;">Save All Interested</button>
    <button id="save-all-client" class="save-btn btn-client" style="flex: 1;">Save All Clients</button>
`;
const resultsContainer = document.getElementById('results-container');
resultsContainer.parentNode.insertBefore(bulkActionsDiv, resultsContainer);

document.getElementById('save-all-interested').addEventListener('click', (e) => bulkSave('Interested', e.target));
document.getElementById('save-all-client').addEventListener('click', (e) => bulkSave('Client', e.target));

async function bulkSave(status, buttonElement) {
    const originalText = buttonElement.innerText;
    buttonElement.disabled = true;

    const unsaved = currentSearchResults.filter(p => !savedBusinesses.some(b => b.place_id === p.place_id));
    
    if (unsaved.length === 0) {
        buttonElement.innerText = "All already saved!";
        setTimeout(() => { buttonElement.innerText = originalText; buttonElement.disabled = false; }, 2000);
        return;
    }

    let count = 0;
    for (const prospect of unsaved) {
        count++;
        buttonElement.innerText = `Saving ${count} of ${unsaved.length}...`;
        try {
            const { data: details } = await db.functions.invoke('get-place-details', { body: { placeId: prospect.place_id } });
            
            await db.from('saved_businesses').upsert({
                place_id: prospect.place_id,
                name: prospect.name,
                status: status,
                lat: prospect.lat, 
                lng: prospect.lng,
                phone: details?.nationalPhoneNumber || null,
                website: details?.websiteUri || null,
                rating: details?.rating ? details.rating.toString() : null
            }, { onConflict: 'place_id' });

            searchLayer.eachLayer(layer => {
                if (layer.options.place_id === prospect.place_id) searchLayer.removeLayer(layer);
            });
        } catch (e) {
            console.error("Failed to save:", prospect.name);
        }
    }

    buttonElement.innerText = "All Saved ✓";
    await fetchSavedBusinesses(); 
    
    setTimeout(() => {
        buttonElement.innerText = originalText;
        buttonElement.disabled = false;
    }, 2000);
}

// --- SEARCH WITH CACHING LOGIC ---
document.getElementById('search-btn').addEventListener('click', async () => {
    const industryInput = document.getElementById('industry-input').value.trim();
    const searchBtn = document.getElementById('search-btn');
    if (!industryInput) return alert("Please enter an industry.");

    searchBtn.innerText = "Searching...";
    searchBtn.disabled = true;
    
    try {
        await fetchSavedBusinesses(); 
        searchLayer.clearLayers(); 
        document.getElementById('results-container').innerHTML = ''; 
        document.getElementById('bulk-actions').style.display = 'none';

        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        const { data: cachedProspects } = await db.from('prospects')
            .select('*')
            .ilike('industry', `%${industryInput}%`)
            .gte('lat', sw.lat).lte('lat', ne.lat)
            .gte('lng', sw.lng).lte('lng', ne.lng);

        console.log("Fetching fresh data from Google...");
        const { data: apiProspects, error } = await db.functions.invoke('search-places', {
            body: { query: industryInput, ne, sw }
        });

        if (error || !apiProspects || apiProspects.error) throw new Error(apiProspects?.error || "Search failed.");

        const cacheMap = new Map((cachedProspects || []).map(p => [p.place_id, p]));
        
        const newProspects = [];
        apiProspects.forEach(p => {
            if (!cacheMap.has(p.place_id)) {
                newProspects.push({
                    place_id: p.place_id,
                    name: p.name,
                    industry: industryInput,
                    lat: p.geometry.location.lat,
                    lng: p.geometry.location.lng,
                    address: p.formatted_address || ''
                });
            }
        });

        if (newProspects.length > 0) {
            await db.from('prospects').upsert(newProspects);
        }

        const allProspects = [...(cachedProspects || []), ...newProspects];
        currentSearchResults = allProspects;

        if (allProspects.length === 0) {
            alert("No businesses found.");
        } else {
            allProspects.forEach(p => createSidebarCard(p, 'results-container', false));
            document.getElementById('bulk-actions').style.display = 'flex'; 
        }

    } catch (err) {
        console.error("Search Error:", err);
        alert("Search failed: " + err.message);
    } finally {
        searchBtn.innerText = "Search Territory";
        searchBtn.disabled = false;
    }
});

// --- MODAL DATABASE QUICK ACTIONS & SORTING ---
window.updateClientStatus = async function(placeId, newStatus, buttonElement) {
    buttonElement.innerText = "⏳";
    const { error } = await db.from('saved_businesses').update({ status: newStatus }).eq('place_id', placeId);
    if (!error) {
        await fetchSavedBusinesses();
        renderModalList(); 
    } else {
        buttonElement.innerText = "Error";
    }
};

window.removeClientModal = async function(placeId, buttonElement) {
    buttonElement.innerText = "⏳";
    const { error } = await db.from('saved_businesses').delete().eq('place_id', placeId);
    if (!error) {
        await fetchSavedBusinesses();
        renderModalList();
    } else {
        buttonElement.innerText = "Error";
    }
};

const clientModal = document.getElementById('client-modal');

// 🚨 NEW: Injecting the Sort Dropdown dynamically next to the filter 🚨
const modalControls = document.querySelector('.modal-controls');
if (modalControls && !document.getElementById('modal-sort')) {
    const sortSelect = document.createElement('select');
    sortSelect.id = 'modal-sort';
    sortSelect.innerHTML = `
        <option value="alpha">Sort: Alphabetical (A-Z)</option>
        <option value="distance">Sort: Nearest to HQ</option>
    `;
    modalControls.appendChild(sortSelect);
    sortSelect.addEventListener('change', renderModalList);
}

document.getElementById('open-database-btn').addEventListener('click', () => {
    clientModal.style.display = 'flex';
    renderModalList(); 
});

document.getElementById('close-modal').addEventListener('click', () => {
    clientModal.style.display = 'none';
});

document.getElementById('modal-search').addEventListener('input', renderModalList);
document.getElementById('modal-filter').addEventListener('change', renderModalList);

function renderModalList() {
    const container = document.getElementById('modal-list');
    container.innerHTML = '';
    
    const searchTerm = document.getElementById('modal-search').value.toLowerCase();
    const filterStatus = document.getElementById('modal-filter').value;
    const sortMethod = document.getElementById('modal-sort') ? document.getElementById('modal-sort').value : 'alpha';

    // 1. Filter the array first
    let filtered = savedBusinesses.filter(b => {
        const matchesSearch = b.name.toLowerCase().includes(searchTerm) || (b.address && b.address.toLowerCase().includes(searchTerm));
        const matchesFilter = filterStatus === 'all' || b.status === filterStatus;
        return matchesSearch && matchesFilter;
    });

    // 2. 🚨 NEW: Sort the filtered array 🚨
    const hqPoint = L.latLng(hqLatLng[0], hqLatLng[1]); 
    filtered.sort((a, b) => {
        if (sortMethod === 'distance') {
            const distA = hqPoint.distanceTo(L.latLng(a.lat, a.lng));
            const distB = hqPoint.distanceTo(L.latLng(b.lat, b.lng));
            return distA - distB; // Closest first
        } else {
            return a.name.localeCompare(b.name); // Default Alphabetical
        }
    });

    filtered.forEach(b => {
        let statusColor = '#ffffff'; 
        if (b.status === 'Interested') statusColor = '#ffaa00'; 
        if (b.status === 'Contacted') statusColor = '#007bff'; 
        if (b.status === 'Client') statusColor = '#28a745'; 

        const phoneTxt = b.phone || 'N/A';
        const ratingTxt = b.rating ? `${b.rating} ⭐` : 'N/A';
        
        let websiteHtml = 'N/A';
        if (b.website && b.website.length > 2) {
            const safeUrl = b.website.startsWith('http') ? b.website : 'https://' + b.website;
            websiteHtml = `<a href="${safeUrl}" target="_blank" style="color: var(--accent); text-decoration: underline;">Visit Site</a>`;
        }

        // 🚨 NEW: Calculate the distance to display on the card in miles 🚨
        const distMeters = hqPoint.distanceTo(L.latLng(b.lat, b.lng));
        const distMiles = (distMeters * 0.000621371).toFixed(1);

        const card = document.createElement('div');
        card.className = 'card'; 
        card.style.padding = '15px';
        card.style.background = 'var(--bg-input)';
        card.style.borderRadius = '6px';
        card.style.marginBottom = '10px';

        card.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: var(--accent);">${b.name}</h3>
            <p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${b.status || 'N/A'}</span></p>
            <p style="color: #00c3f5; font-weight: bold;"><strong>Distance:</strong> ${distMiles} miles from HQ</p>
            <p><strong>Rating:</strong> ${ratingTxt}</p>
            <p><strong>Phone:</strong> ${phoneTxt}</p>
            <p><strong>Website:</strong> ${websiteHtml}</p>
            <p style="font-size: 0.85em; color: var(--text-muted); margin-top: 10px; margin-bottom: 15px;">${b.address || 'No address provided'}</p>
            
            <div style="display: flex; gap: 5px; margin-bottom: 10px; flex-wrap: wrap;">
                <button onclick="updateClientStatus('${b.place_id}', 'Interested', this)" class="save-btn btn-interested" style="padding: 6px; font-size: 0.8em; flex: 1;">Interested</button>
                <button onclick="updateClientStatus('${b.place_id}', 'Contacted', this)" class="save-btn" style="background: #007bff; color: white; padding: 6px; font-size: 0.8em; flex: 1;">Contacted</button>
                <button onclick="updateClientStatus('${b.place_id}', 'Client', this)" class="save-btn btn-client" style="padding: 6px; font-size: 0.8em; flex: 1;">Client</button>
                <button onclick="removeClientModal('${b.place_id}', this)" class="save-btn" style="background: #ff4d4d; color: white; padding: 6px; font-size: 0.8em; flex: 1;">Remove</button>
            </div>

            <div class="action-btns" style="margin-top: 0;">
                <button onclick="flyToClient(${b.lat}, ${b.lng})" class="save-btn" style="background: var(--accent); color: #000; border: none; padding: 10px; cursor: pointer; border-radius: 4px; width: 100%;">
                    View on Map
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

window.flyToClient = function(lat, lng) {
    clientModal.style.display = 'none'; 
    map.flyTo([lat, lng], 16);          
};

// --- SAFE ASYNC CONFIGURATION INITIALIZATION ---
async function startApp() {
    let url = window.SUPABASE_URL;
    let key = window.SUPABASE_ANON_KEY;

    if (!url || !key) {
        try {
            const res = await fetch('/api/keys');
            if (!res.ok) throw new Error("Vercel API returned status: " + res.status);
            
            const data = await res.json();
            url = data.supabaseUrl;
            key = data.supabaseAnonKey;
        } catch (e) {
            console.error("Could not load backend environment config keys:", e);
        }
    }

    if (!url || !key || url.includes("YOUR_")) {
        console.error("Database connection parameters are missing. Map UI will not function.");
        return;
    }

    db = supabase.createClient(url, key);
    console.log("Supabase Client initialized successfully!");
    
    fetchSavedBusinesses();
}

startApp();