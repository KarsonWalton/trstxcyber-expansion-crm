// --- DATABASE & MAP INITIALIZATION ---
// 1. Declare the database variable without assigning it yet
let db; 

// Map Setup
const map = L.map('map').setView([33.8, -118.0], 10);
L.tileLayer('https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=xzW3zqFAhBFSjDCyei9e', {
    attribution: '<a href="https://www.maptiler.com/copyright/">MapTiler</a>',
    tileSize: 512, zoomOffset: -1, minZoom: 0
}).addTo(map);

const searchLayer = L.layerGroup().addTo(map);
const savedLayer = L.layerGroup().addTo(map);

let savedBusinesses = [];

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

async function saveBusiness(prospect, status, buttonElement) {
    buttonElement.innerText = "Saving...";
    const { error } = await db.from('saved_businesses').upsert({
        place_id: prospect.place_id,
        name: prospect.name,
        status: status,
        lat: prospect.lat, 
        lng: prospect.lng
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

    // Glow Effect Logic
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

                body.querySelector('.btn-interested').addEventListener('click', (e) => saveBusiness(prospect, 'Interested', e.target));
                body.querySelector('.btn-client').addEventListener('click', (e) => saveBusiness(prospect, 'Client', e.target));
                
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
        const badgeColor = p.status === 'Interested' ? '#ffaa00' : '#00cc66';
        p.displayName = `${p.name} <span style="font-size: 0.7em; padding: 2px 6px; margin-left: 6px; border-radius: 4px; background: ${badgeColor}; color: #000; font-weight: bold;">${p.status}</span>`;
        createSidebarCard(p, 'saved-container', true);
    });
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

        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();

        // 1. Get whatever we already have in our cache for this area
        const { data: cachedProspects } = await db.from('prospects')
            .select('*')
            .ilike('industry', `%${industryInput}%`)
            .gte('lat', sw.lat).lte('lat', ne.lat)
            .gte('lng', sw.lng).lte('lng', ne.lng);

        // 2. ALWAYS fetch from Google so we catch new ones when zoomed out
        console.log("Fetching fresh data from Google...");
        const { data: apiProspects, error } = await db.functions.invoke('search-places', {
            body: { query: industryInput, ne, sw }
        });

        if (error || !apiProspects || apiProspects.error) throw new Error(apiProspects?.error || "Search failed.");

        // 3. Combine them and remove duplicates (using place_id)
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

        // 4. Silently save the new ones we found to the database
        if (newProspects.length > 0) {
            await db.from('prospects').upsert(newProspects);
        }

        // 5. Render everything together
        const allProspects = [...(cachedProspects || []), ...newProspects];
        
        if (allProspects.length === 0) {
            alert("No businesses found.");
        } else {
            allProspects.forEach(p => createSidebarCard(p, 'results-container', false));
        }

    } catch (err) {
        console.error("Search Error:", err);
        alert("Search failed: " + err.message);
    } finally {
        searchBtn.innerText = "Search Territory";
        searchBtn.disabled = false;
    }
});

// --- SAFE ASYNC CONFIGURATION INITIALIZATION ---
async function startApp() {
    let url = window.SUPABASE_URL;
    let key = window.SUPABASE_ANON_KEY;

    // If running on Vercel, the local config.js will safely 404, meaning url/key are undefined. 
    // If so, fetch them dynamically from the secure serverless backend.
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

    // Final safety check before connecting to Supabase
    if (!url || !key || url.includes("YOUR_")) {
        console.error("Database connection parameters are missing. Map UI will not function.");
        return;
    }

    // Initialize the global client workspace
    db = supabase.createClient(url, key);
    console.log("Supabase Client initialized successfully!");
    
    // Begin data fetching safely
    fetchSavedBusinesses();
}

// Start execution
startApp();