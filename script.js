// ============================================================
// 1. CONFIGURATION CARTE ET COUCHES
// ============================================================
proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
ol.proj.proj4.register(proj4);

const osmLayer = new ol.layer.Tile({ source: new ol.source.OSM(), visible: true });

const satelliteLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles &copy; Esri'
    }),
    visible: false
});

const grayLayer = new ol.layer.Group({
    visible: false,
    layers: [
        new ol.layer.Tile({ source: new ol.source.XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}' })}),
        new ol.layer.Tile({ source: new ol.source.XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}' })})
    ]
});

const searchSource = new ol.source.Vector();
const highlightSource = new ol.source.Vector();

const searchLayer = new ol.layer.Vector({
    source: searchSource,
    style: new ol.style.Style({
        image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({ color: '#007bff' }), stroke: new ol.style.Stroke({ color: '#fff', width: 2 }) })
    }),
    zIndex: 2000
});

const highlightLayer = new ol.layer.Vector({
    source: highlightSource,
    style: new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#007bff', width: 3 }), fill: new ol.style.Fill({ color: 'rgba(0,0,0,0)' }) }),
    zIndex: 1999
});

const franceCoords = ol.proj.fromLonLat([2.2137, 46.2276]);
const allLayersData = {}; 
let currentFilterTerm = ""; // Terme de filtre global

const map = new ol.Map({
    target: 'map',
    layers: [satelliteLayer, osmLayer, grayLayer, highlightLayer, searchLayer],
    view: new ol.View({ center: franceCoords, zoom: 6 }),
    controls: ol.control.defaults.defaults({ zoom: true, attribution: true }) 
});

let windLayer = null; // Contiendra la couche OpenWeather

// ==========================================
// BLOC A : INITIALISATION DE LA POPUP
// ==========================================
const container = document.getElementById('popup');
const content = document.getElementById('popup-content');
const closer = document.getElementById('popup-closer');
let lastClickedFeatureId = null; // Pour gérer la bascule vers la météo au 2ème clic

const overlay = new ol.Overlay({
    element: container,
    autoPan: { animation: { duration: 250 } },
    positioning: 'bottom-center',
    stopEvent: true,
    offset: [0, -10]
});
map.addOverlay(overlay);

closer.onclick = function () {
    overlay.setPosition(undefined);
    closer.blur();
    return false;
};

// Fonction pour fermer proprement la météo et vider les données
function hideWeather() {
    const widget = document.getElementById('weather-widget');
    if (widget) {
        widget.style.display = "none";
        widget.innerHTML = ""; // Vide le HTML pour éviter le flash de l'ancienne ville au prochain clic
    }
}


// ============================================================
// 2. ÉLÉMENTS UI
// ============================================================
const searchInput = document.getElementById('address');
const suggestionsBox = document.getElementById('suggestions');
const layerMenu = document.getElementById('layer-menu');
const dataMenu = document.getElementById('data-layers-menu');
const tablePanel = document.getElementById('attribute-table');
const layerSelector = document.getElementById('layer-selector');
const openTableBtn = document.getElementById('open-table-btn');
const closeTableBtn = document.getElementById('close-table-btn');
const filterInput = document.getElementById('filter-input');
const exportBtn = document.getElementById('export-btn');
const tableHead = document.getElementById('table-head');
const tableBody = document.getElementById('table-body');
const tableCount = document.getElementById('table-count');

// ==========================================
// FONCTIONS UTILITAIRES & MÉTÉO
// ==========================================

/**
 * 1. Convertit les degrés en direction cardinale
 */
function getCardinalDir(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return directions[Math.round((angle || 0) / 45) % 8];
}

/**
 * 2. Mappe les codes OpenWeather vers les classes CSS de Weather Icons
 */
function getWeatherIconClass(owIconCode) {
    const map = {
        // CIEL DÉGAGÉ
        '01d': 'wi-day-sunny',          
        '01n': 'wi-night-clear',        
        
        // QUELQUES NUAGES (Soleil/Lune encore visibles)
        '02d': 'wi-day-cloudy',         
        '02n': 'wi-night-alt-cloudy',   
        
        // NUAGES ÉPARS
        '03d': 'wi-cloud',              
        '03n': 'wi-cloud',              
        
        // NUAGES COUVERTS
        '04d': 'wi-cloudy',             
        '04n': 'wi-cloudy',             
        
        // PLUIE LÉGÈRE / AVERSES
        '09d': 'wi-day-showers',        
        '09n': 'wi-night-alt-showers',  
        
        // PLUIE MODÉRÉE À FORTE
        '10d': 'wi-day-rain',           
        '10n': 'wi-night-alt-rain',     
        
        // ORAGE
        '11d': 'wi-day-thunderstorm',   
        '11n': 'wi-night-alt-thunderstorm', 
        
        // NEIGE
        '13d': 'wi-day-snow',           
        '13n': 'wi-night-alt-snow',     
        
        // BROUILLARD
        '50d': 'wi-day-fog',            
        '50n': 'wi-night-fog'           
    };

    // Si le code n'est pas dans la liste, on renvoie une icône neutre
    return map[owIconCode] || 'wi-na';
}
/**
 * 3. Déclenche l'affichage météo (Mode Ville/Terre)
 */
async function triggerWeatherAtLocation(coordinate) {
    const widget = document.getElementById('weather-widget');
    if (!widget) return;

    try {
        const lonLat = ol.proj.toLonLat(coordinate);
        const apiKey = '572c0e1351014797c4bc157ad3a2eb83'; 
        const urlW = `https://api.openweathermap.org/data/2.5/weather?lat=${lonLat[1]}&lon=${lonLat[0]}&appid=${apiKey}&units=metric&lang=fr`;
        const urlF = `https://api.openweathermap.org/data/2.5/forecast?lat=${lonLat[1]}&lon=${lonLat[0]}&appid=${apiKey}&units=metric&lang=fr`;

        const [resW, resF] = await Promise.all([fetch(urlW), fetch(urlF)]);
        const data = await resW.json();
        const fData = await resF.json();
        
        if (data.cod !== 200) return;

        const locationName = (data.name && data.name.trim().length > 0) ? data.name : "Zone identifiée";
        const liveDeg = data.wind.deg || 0;
        const iconClass = getWeatherIconClass(data.weather[0].icon);

        // --- PRÉVISIONS (Forecast) ---
        const timezoneOffset = fData.city.timezone;
        const seen = new Set();
        const todayStr = new Date().toISOString().split('T')[0];
        
        let fHTML = `<div style="display:flex; justify-content:space-between; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.2);">`;

        const dailyData = fData.list.filter(item => {
            const localDate = new Date((item.dt + timezoneOffset) * 1000);
            const itemDateStr = localDate.toISOString().split('T')[0];
            const itemHour = localDate.getUTCHours();
            if (itemDateStr !== todayStr && !seen.has(itemDateStr) && itemHour >= 12 && itemHour <= 15) {
                seen.add(itemDateStr);
                return true;
            }
            return false;
        }).slice(0, 5);

dailyData.forEach(d => {
            const dt = new Date((d.dt + timezoneOffset) * 1000);
            const fIconClass = getWeatherIconClass(d.weather[0].icon);
            // --- NOUVELLES VARIABLES VENT ---
            const fWindDeg = d.wind.deg || 0; 
            const fWindSpeed = Math.round(d.wind.speed * 3.6); 

            fHTML += `
                <div style="text-align:center; flex:1; border-right: 1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:9px; font-weight:bold; opacity:0.8;">${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}</div>
                    
                    <i class="wi ${fIconClass}" style="font-size:18px; color:#00f2ff; margin: 8px 0; display:block; filter: drop-shadow(0 0 2px rgba(0,242,255,0.5));"></i>
                    
                    <div style="font-size:11px; color:#fff; font-weight:900;">${Math.round(d.main.temp)}°</div>
                    
                    <div style="font-size:9px; color:#adff2f; font-weight:bold; margin-top:4px;">${fWindSpeed}<span style="font-size:7px">k/h</span></div>
                    <div style="display:flex; justify-content:center; align-items:center; gap:2px; color:#00f2ff; margin-top:2px;">
                        <span style="font-size:8px; font-weight:900;">${getCardinalDir(fWindDeg)}</span>
                        <span style="display:inline-block; transform:rotate(${fWindDeg}deg); font-size:10px;">↓</span>
                    </div>
                </div>`;
        });
        fHTML += `</div>`;

        // --- AFFICHAGE FINAL DU WIDGET ---
        widget.style.display = "block";
        widget.innerHTML = `
            <div style="font-size:9px; text-transform:uppercase; opacity:0.7; margin-bottom:5px; font-weight:bold; letter-spacing:1px;">MÉTÉO TEMPS RÉEL</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <b style="color:#00f2ff; font-size:18px;">${locationName}</b>
                <i class="wi ${iconClass}" style="font-size:45px; color:#fff; filter: drop-shadow(0px 0px 8px rgba(255,255,255,0.4));"></i>
            </div>
            
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
                <span>Température</span><b>${Math.round(data.main.temp)}°C</b>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:14px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
                <span>Vent</span><b style="color:#adff2f;">${Math.round(data.wind.speed * 3.6)} km/h</b>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px;">
                <span>Direction</span>
                <div style="display:flex; align-items:center; gap:6px; color:#00f2ff; font-weight:900;">
                    <span>${getCardinalDir(liveDeg)}</span>
                    <span style="display:inline-block; transform:rotate(${liveDeg}deg); font-size:18px;">↓</span>
                </div>
            </div>

            ${fHTML}

            <div style="width: 100%; font-size: 8px; opacity: 0.4; text-align: right; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                SOURCE : OPENWEATHER & WI
            </div>`;

    } catch (e) { 
        console.error("Erreur Météo :", e); 
    }
}

// ============================================================
// 3. RESET RECHERCHE & RECHERCHE PHOTON (LOGIQUE COMPLÈTE CONSERVÉE)
// ============================================================
function resetSearch() {
    searchSource.clear();
    suggestionsBox.style.display = 'none';
    searchInput.value = '';
    searchInput.blur();
    // Optionnel : on cache aussi la météo si on reset tout ? 
    // document.getElementById('weather-widget').style.display = 'none';
}

searchInput.addEventListener('input', async e => {
    const text = e.target.value.trim();
    if (text.length < 3) { suggestionsBox.style.display = 'none'; return; }
    try {
        const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=5&lang=fr`);
        const data = await response.json();
        renderSuggestions(data.features);
    } catch (err) { console.error('Erreur Photon :', err); }
});

function renderSuggestions(features) {
    suggestionsBox.innerHTML = '';
    if (!features || features.length === 0) { suggestionsBox.style.display = 'none'; return; }
    features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        const props = feature.properties || {};
        const label = props.name + (props.city ? ` (${props.city})` : '') + (props.country ? `, ${props.country}` : '');
        item.textContent = label;
        item.onclick = e => {
            const coords = ol.proj.fromLonLat(feature.geometry.coordinates);
            
            // --- MISE À JOUR : On déclenche la météo de la ville recherchée ---
            triggerWeatherAtLocation(coords);

            map.getView().animate({ center: coords, zoom: 12, duration: 700 });
            searchSource.clear();
            searchSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(coords) }));
            suggestionsBox.style.display = 'none';
            searchInput.value = props.name || '';
        };
        suggestionsBox.appendChild(item);
    });
    suggestionsBox.style.display = 'block';
}

// ============================================================
// 4. ÉVÉNEMENTS CARTE & BASEMAP
// ============================================================
map.on('click', evt => { if (!map.forEachFeatureAtPixel(evt.pixel, f => f)) resetSearch(); });

document.getElementById('home-btn').onclick = e => {
    resetSearch(); 
    highlightSource.clear();
    
    // --- RÉPARATION : On ferme tout et on reset le suivi ---
    hideWeather(); 
    overlay.setPosition(undefined);
    lastClickedFeatureId = null; 
    
    map.getView().animate({ center: franceCoords, zoom: 6, duration: 800 });
};

document.getElementById('layer-btn').onclick = e => { e.stopPropagation(); layerMenu.classList.toggle('active'); dataMenu.classList.remove('active'); };
document.getElementById('data-layers-btn').onclick = e => { e.stopPropagation(); dataMenu.classList.toggle('active'); layerMenu.classList.remove('active'); };

document.querySelectorAll('input[name="base"]').forEach(r => {
    r.onchange = e => {
        osmLayer.setVisible(e.target.id === 'osm');
        satelliteLayer.setVisible(e.target.id === 'sat');
        grayLayer.setVisible(e.target.id === 'gray');
    };
});

// ============================================================
// 5. GESTION DE LA TABLE ATTRIBUTAIRE (VERSION CORRIGÉE)
// ============================================================
function updateTable(layerId, features = null) {
    const data = allLayersData[layerId]; 
    if (!data) return;
    
    let feat = features || data.source.getFeatures();
    
    // Application du filtre dynamique (Table uniquement)
    if (currentFilterTerm !== "") {
        feat = feat.filter(f => Object.values(f.getProperties()).some(v => v && String(v).toLowerCase().includes(currentFilterTerm)));
    }

    tableHead.innerHTML = ''; 
    tableBody.innerHTML = '';
    tableCount.textContent = `${feat.length} entités`;
    
    if (feat.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:15px;">Aucune donnée correspondant au filtre</td></tr>';
        return;
    }

    // Extraction des colonnes (exclure la géométrie)
    const cols = Object.keys(feat[0].getProperties()).filter(k => k !== 'geometry');
    const trH = document.createElement('tr');
    cols.forEach(c => { 
        const th = document.createElement('th'); 
        th.textContent = c.toUpperCase(); 
        trH.appendChild(th); 
    });
    tableHead.appendChild(trH);

    // Remplissage des lignes (limité à 500 pour la performance)
    feat.slice(0, 500).forEach(f => {
        const trB = document.createElement('tr');
        cols.forEach(c => { 
            const td = document.createElement('td'); 
            td.textContent = f.get(c) ?? ''; 
            trB.appendChild(td); 
        });
        // Zoom sur l'entité au clic sur la ligne
        trB.onclick = () => {
            const geom = f.getGeometry();
            if (geom) {
                map.getView().fit(geom.getExtent(), { duration: 800, padding: [100,100,100,100] });
            }
        };
        tableBody.appendChild(trB);
    });
}

// CHANGEMENT DE COUCHE DANS LA TABLE
layerSelector.onchange = e => {
    highlightSource.clear();
    filterInput.value = '';
    currentFilterTerm = "";
    
    // MODIFICATION : On ne touche PLUS à setVisible(id === e.target.value)
    // Cela permet de garder les autres couches allumées sur la carte.
    
    updateTable(e.target.value);

    // On rafraîchit les sources pour que getCustomStyle sache quelle couche filtrer visuellement
    Object.keys(allLayersData).forEach(id => { 
        if (allLayersData[id].layer) allLayersData[id].layer.getSource().changed(); 
    });
};

// ============================================================
// 6. FILTRAGE, ZOOM ET GESTION DE LA TABLE
// ============================================================
function refreshDisplay(layerId) {
    Object.keys(allLayersData).forEach(id => { 
        if (allLayersData[id].layer) allLayersData[id].layer.getSource().changed(); 
    });
    updateTable(layerId);
}

// ACTION : Filtrer et Zoomer (Seulement sur la couche active)
document.getElementById('filter-btn').onclick = () => {
    currentFilterTerm = filterInput.value.trim().toLowerCase();
    const layerId = layerSelector.value;
    
    if (!layerId || !allLayersData[layerId]) return;

    const source = allLayersData[layerId].source;
    const matchingFeatures = source.getFeatures().filter(f => 
        Object.values(f.getProperties()).some(v => v && String(v).toLowerCase().includes(currentFilterTerm))
    );

    // Zoom sur les résultats du filtre
    if (matchingFeatures.length > 0) {
        const extent = ol.extent.createEmpty();
        matchingFeatures.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
        map.getView().fit(extent, { duration: 800, padding: [100, 100, 100, 100], maxZoom: 16 });
    }

    refreshDisplay(layerId);
};

// ACTION : Réinitialiser (Affiche tout et dézoome sur la couche)
document.getElementById('reset-filter-btn').onclick = () => {
    filterInput.value = ""; 
    currentFilterTerm = "";
    const layerId = layerSelector.value;
    
    if (layerId && allLayersData[layerId]) {
        const extent = allLayersData[layerId].source.getExtent();
        if (!ol.extent.isEmpty(extent)) {
            map.getView().fit(extent, { duration: 800, padding: [50, 50, 50, 50] });
        }
    }
    
    refreshDisplay(layerId);
};

// ACTION : Ouvrir la table
openTableBtn.onclick = () => {
    const selectedId = layerSelector.value;
    if (selectedId && allLayersData[selectedId]) {
        tablePanel.classList.add('active'); 
        updateTable(selectedId);
    } else {
        alert("Veuillez d'abord cocher une couche dans la légende à gauche.");
    }
};

// ACTION : Fermer la table
closeTableBtn.onclick = () => tablePanel.classList.remove('active');

// ACTION : Export CSV
exportBtn.onclick = () => {
    const layerId = layerSelector.value; 
    if (!layerId) return;
    const rows = [];
    const headers = Array.from(tableHead.querySelectorAll('th')).map(th => th.textContent);
    rows.push(headers.join(';'));
    tableBody.querySelectorAll('tr').forEach(tr => {
        rows.push(Array.from(tr.querySelectorAll('td')).map(td => td.textContent).join(';'));
    });
    const blob = new Blob(["\ufeff" + rows.join('\n')], {type:'text/csv;charset=utf-8;'});
    const a = document.createElement('a'); 
    a.href = URL.createObjectURL(blob); 
    a.download = `${layerId}_export.csv`; 
    a.click();
};

// ============================================================
// 7. STYLES ET LÉGENDES (VERSION KM & ANTI-CHEVAUCHEMENT)
// ============================================================

function hexToRgba(hex, opacity) {
    let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getLegendHTML(id) {
    let html = '<div style="padding-left: 30px; margin-top: 8px; margin-bottom: 15px; font-size: 0.85em; color: #444; border-left: 1px solid #ddd; margin-left: 5px;">';
    const rowStyle = 'display: flex; align-items: center; margin-bottom: 8px; height: 26px;';
    const imgStyle = 'width: 24px; height: 24px; object-fit: contain; margin-right: 12px; flex-shrink: 0;';
    const lineStyle = 'display: inline-block; width: 24px; margin-right: 12px; flex-shrink: 0;';

    if (id === 'eoliennes') {
        // Dessin SVG du mât pour remplacer le fichier manquant
        const derrickSVG = '<svg viewBox="0 0 100 120" style="width:24px; height:24px; margin-right:12px; overflow:visible;"><path d="M50 10 L85 110 L15 110 Z" fill="none" stroke="#333" stroke-width="6"/><path d="M30 60 L70 60 M20 90 L80 90" stroke="#333" stroke-width="6"/><circle cx="50" cy="10" r="12" fill="yellow" stroke="black" stroke-width="3"/></svg>';

        html += `
            <div style="${rowStyle}"><img src="symbols/TURBINE.svg" style="${imgStyle}"> Turbine</div>
            <div style="${rowStyle}"><img src="symbols/OSS.svg" style="${imgStyle}"> Substation (OSS)</div>
            <div style="${rowStyle}">${derrickSVG} Measurement Mast</div>
            <div style="${rowStyle}"><img src="symbols/SC.svg" style="${imgStyle}"> Subsea Connector</div>`;
    } 
    else if (id === 'cables') {
        html += `
            <div style="${rowStyle}"><span style="${lineStyle} border-top: 3px solid #ff001c;"></span> Inter-turbine cable</div>
            <div style="${rowStyle}"><span style="${lineStyle} border-top: 3px solid #002ff3;"></span> Export cable</div>`;
    }
    else if (id === 'parks') {
        html += `
            <div style="${rowStyle}"><span style="width:14px; height:14px; background:rgba(34, 255, 0, 0.46); border:1px solid #232323; margin-right:12px;"></span> Fixed foundation</div>
            <div style="${rowStyle}"><span style="width:14px; height:14px; background:rgba(0, 116, 255, 0.46); border:1px solid #232323; margin-right:12px;"></span> Floating foundation</div>
            <div style="${rowStyle}"><span style="width:14px; height:14px; background:rgba(227, 26, 28, 0.46); border:1px solid #232323; margin-right:12px;"></span> Undetermined</div>`;
    }
    else if (id === 'm_border') {
        html += `<div style="${rowStyle}"><span style="${lineStyle} border-top: 2px solid #232323;"></span> Maritime boundary</div>`;
    }
    else if (id === 'bathy') {
        html += `<div style="${rowStyle}"><span style="${lineStyle} border-top: 1.2px solid #91522d;"></span> Bathymetric contour</div>`;
    }

    html += '</div>';
    return html;
}

function getCustomStyle(id, feature, resolution) {
    const props = feature.getProperties();
    const activeLayerId = layerSelector.value;

    if (currentFilterTerm !== "" && id === activeLayerId) {
        const match = Object.values(props).some(v => v && String(v).toLowerCase().includes(currentFilterTerm));
        if (!match) return new ol.style.Style({}); 
    }

// --- CÂBLES (RÉGLAGE ÉCHELLE & STYLE ÉPURÉ) ---
if (id === 'cables') {
    const col = (props.type === 'inter_turbine') ? '#ff001c' : '#002ff3';
    
    let valLong = props.Long || props.long || 0;
    let txtLong = (valLong > 0) ? (parseFloat(valLong) / 1000).toFixed(1) + " km" : "";

    // Logique d'écartement basée sur l'id_park pour éviter le chevauchement
    const parkName = String(props.id_park || "");
    const offsetValue = parkName.includes("1") ? -12 : 12;

    return new ol.style.Style({ 
        stroke: new ol.style.Stroke({ 
            color: col, 
            width: 2.5, 
            lineDash: [10, 5] 
        }),
        // CHANGEMENT ICI : resolution < 150 (au lieu de 30) 
        // permet de voir les labels même en dézoomant beaucoup
        text: (resolution < 150 && txtLong !== "") ? new ol.style.Text({
            text: txtLong,
            font: 'bold 11px Calibri, sans-serif',
            placement: 'line',
            repeat: 1500, // On augmente le repeat pour ne pas saturer la vue de loin
            fill: new ol.style.Fill({ color: col }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }), 
            offsetY: offsetValue,
            overflow: false
        }) : null
    });
}

// --- BATHYMÉTRIE (AVEC SIGNE NÉGATIF) ---
if (id === 'bathy') {
    let valBathy = props.Elevation || props.ELEVATION || props.elevation;
    
    // On ajoute le "-" devant la valeur arrondie
    let txtBathy = (valBathy !== undefined) ? "-" + String(Math.round(parseFloat(valBathy))) + "m" : "";

    return new ol.style.Style({ 
        stroke: new ol.style.Stroke({ color: '#91522d', width: 1.2 }),
        text: (resolution < 150 && txtBathy !== "") ? new ol.style.Text({
            text: txtBathy,
            font: 'bold 10px Arial, sans-serif',
            placement: 'line',
            repeat: 1200, 
            fill: new ol.style.Fill({ color: '#91522d' }),
            stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
            textBaseline: 'middle'
        }) : null
    });
}

// --- BLOC ÉOLIENNES ET ENTITÉS ---
if (id === 'eoliennes' || id === 'entites' || props.park_name) {
    const type = String(props.entity_typ || "").toLowerCase().trim();
    
    // Style par défaut (Turbines)
    let iconSrc = 'symbols/TURBINE.svg';
    let s = 0.05;
    let z = 1;

// 1. STYLE POUR LE MEASUREMENT MAST (Derrick en dessin pur)
    if (type.includes('mast') || type.includes('measurement')) {
        return [
            // La structure principale (Triangle haut et fin)
            new ol.style.Style({
                image: new ol.style.RegularShape({
                    fill: new ol.style.Fill({color: 'rgba(0,0,0,0.1)'}),
                    stroke: new ol.style.Stroke({color: '#333', width: 2}),
                    points: 3,
                    radius: 18,
                    scale: [0.6, 2], // On l'étire pour faire une tour fine
                    rotation: 0
                }),
                zIndex: 1000
            }),
            // Les barres horizontales (Treillis)
            new ol.style.Style({
                image: new ol.style.RegularShape({
                    stroke: new ol.style.Stroke({color: '#333', width: 1.5}),
                    points: 4,
                    radius: 8,
                    scale: [1, 0.1], 
                    displacement: [0, 10] // Barre du haut
                }),
                zIndex: 1001
            }),
            // La balise jaune au sommet
            new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 3,
                    fill: new ol.style.Fill({color: 'yellow'}),
                    stroke: new ol.style.Stroke({color: 'black', width: 1}),
                    displacement: [0, 30] // Tout en haut de la tour
                }),
                zIndex: 1002
            })
        ];
    }

    // 2. CONNECTEURS
    else if (type.includes('connector') || type.includes('subsea')) {
        iconSrc = 'symbols/SC.svg';
        s = 0.3;
        z = 1000;
    }

    // 3. SUBSTATIONS
    else if (type.includes('substation') || type.includes('oss')) {
        iconSrc = 'symbols/OSS.svg';
        s = 0.05;
        z = 100;
    }

    // Style final pour les autres (Turbines, etc.)
    return new ol.style.Style({ 
        image: new ol.style.Icon({ 
            src: iconSrc, 
            scale: s,
            anchor: [0.5, 0.5]
        }),
        zIndex: z
    });
}

    // --- PARKS ---
    if (id === 'parks') {
        const type = props.type;
        let color = (type === 'fixed') ? '#22ff00' : (type === 'floating' ? '#0074ff' : '#e31a1c');
        return new ol.style.Style({
            fill: new ol.style.Fill({ color: hexToRgba(color, 0.46) }),
            stroke: new ol.style.Stroke({ color: 'rgba(35, 35, 35, 0.46)', width: 1 })
        });
    }

    return new ol.style.Style({ stroke: new ol.style.Stroke({ color: '#232323', width: 2 }) });
}

function addDataLayer(url, name, id, zIndex) {
    const source = new ol.source.Vector({ url: url, format: new ol.format.GeoJSON({ featureProjection: 'EPSG:3857' }) });
    
    const layer = new ol.layer.Vector({ 
        source: source, 
        zIndex: zIndex, 
        style: (f, res) => getCustomStyle(id, f, res), 
        visible: false,
        declutter: false // <-- ACTIVE L'ANTI-CHEVAUCHEMENT AUTOMATIQUE
    });

    map.addLayer(layer);
    allLayersData[id] = { source, layer, name };

    const container = document.createElement('div');
    container.innerHTML = `
        <div style="display: flex; align-items: center; padding: 5px 0;">
            <input type="checkbox" id="chk-${id}" style="margin-right: 12px; cursor:pointer; width: 16px; height: 16px;">
            <label for="chk-${id}" style="font-weight: bold; cursor: pointer; font-size: 1.1em;">${name}</label>
        </div>
        ${getLegendHTML(id)}`;
    
    document.getElementById('layers-list').appendChild(container);
    container.querySelector('input').onchange = e => {
        layer.setVisible(e.target.checked);
        if(e.target.checked) {
            if(![...layerSelector.options].some(o => o.value === id)){
                const opt = document.createElement('option');
                opt.value = id; opt.textContent = name;
                layerSelector.appendChild(opt);
            }
            layerSelector.value = id;
            updateTable(id);
        }
    };
}

// Lancement
addDataLayer('data/entites.geojson', 'Éoliennes', 'eoliennes', 10);
addDataLayer('data/cables.geojson', 'Câbles Sous-marins', 'cables', 8);
addDataLayer('data/parks.geojson', 'Wind Farms', 'parks', 5);
addDataLayer('data/maritime_border.geojson', 'Frontières Maritimes', 'm_border', 3);
addDataLayer('data/bathy.json', 'Bathymétrie', 'bathy', 1);

// Échelle et contrôles
map.addControl(new ol.control.ScaleLine({ units: 'metric', bar: true, steps: 4, text: true, minWidth: 100 }));



/* ============================================================
    9. FILTRAGE PAR ZONE (BOUTON 🔍 ZONE)
============================================================ */
const btnZone = document.getElementById('filter-extent-btn');
if (btnZone) {
    btnZone.onclick = function() {
        const activeId = layerSelector.value;
        if (!activeId || !allLayersData[activeId]) return;

        const extent = map.getView().calculateExtent(map.getSize());
        const features = allLayersData[activeId].source.getFeaturesInExtent(extent);
        updateTable(activeId, features);
    };
}

// ==========================================
// BLOC B : GESTION DU DOUBLE CLIC (INFOS PUIS MÉTÉO)
// ==========================================
map.on('singleclick', function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);

    if (feature) {
        const currentFeatureId = feature.get('park_name') || feature.get('site');

        // CONDITION : SI DEUXIÈME CLIC SUR LE MÊME OBJET -> MÉTÉO
        if (lastClickedFeatureId === currentFeatureId) {
            overlay.setPosition(undefined); 
            triggerMarineWeatherAlert(evt.coordinate);
            lastClickedFeatureId = null; 
            return;
        }

        // SINON : PREMIER CLIC -> POPUP TECHNIQUE
        const props = feature.getProperties();
        let html = "";

        if (props.park_name) {
            // Bloc pour les éoliennes (Wind Turbines)
            html = `
                <div class="popup-title">${props.park_name.replace(/_/g, ' ')}</div>
                <div class="popup-grid">
                    <div class="popup-label">Type :</div>
                    <div class="popup-value">${props.entity_typ || 'N/A'}</div>
                    
                    <div class="popup-label">Fondation :</div>
                    <div class="popup-value">${props.foundation || 'N/A'}</div>
                </div>`;
        } else if (props.site) {
            // Bloc pour les parcs (Wind Farms) avec alignement parfait
            html = `
                <div class="popup-title">${props.site}</div>
                <div class="popup-grid">
                    <div class="popup-label">Description :</div>
                    <div class="popup-value">${props.descriptio || 'N/A'}</div>
                    
                    <div class="popup-label">État :</div>
                    <div class="popup-value">${props.etat || 'N/A'}</div>
                    
                    <div class="popup-label">Surface :</div>
                    <div class="popup-value">${props.surface || 'N/A'}</div>
                    
                    <div class="popup-label">Type :</div>
                    <div class="popup-value">${props.type || 'N/A'}</div>
                </div>
            `;
        }

        if (html !== "") {
            hideWeather(); // On cache la météo quand on ouvre une info technique
            content.innerHTML = html;
            overlay.setPosition(evt.coordinate);
            lastClickedFeatureId = currentFeatureId;
            return;
        }
    }

// SI CLIC DANS LE VIDE
    overlay.setPosition(undefined);
    lastClickedFeatureId = null;
    // Cette fonction gère l'alerte marine et bascule sur OpenWeather si on est sur terre
    triggerMarineWeatherAlert(evt.coordinate); 
});

function toggleWindLayer() {
    let btn = document.getElementById('wind-toggle-btn');
    
    // FORCE LA CRÉATION DU BOUTON S'IL EST ABSENT (Sécurité GitHub Pages)
    if (!btn) {
        console.warn("Bouton introuvable, création manuelle...");
        btn = document.createElement('button');
        btn.id = 'wind-toggle-btn';
        btn.innerHTML = '💨'; 
        Object.assign(btn.style, {
            position: 'fixed', top: '150px', left: '10px', zIndex: '5000',
            width: '34px', height: '34px', backgroundColor: 'white',
            border: '1px solid #ccc', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '4px'
        });
        document.body.appendChild(btn);
        btn.onclick = toggleWindLayer;
    }

    let legend = document.getElementById('wind-legend-container');
    
    if (!windLayer) {
        windLayer = new ol.layer.Tile({
            source: new ol.source.XYZ({
                url: 'https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=572c0e1351014797c4bc157ad3a2eb83',
                crossOrigin: 'anonymous'
            }),
            opacity: 1,
            visible: false,
            zIndex: 100
        });

        windLayer.on('prerender', (evt) => {
            evt.context.filter = 'brightness(1.1) contrast(1.7) saturate(2.0)';
        });
        windLayer.on('postrender', (evt) => {
            evt.context.filter = 'none';
        });

        map.addLayer(windLayer);
    }

    const isVisible = windLayer.getVisible();

    if (!isVisible) {
        windLayer.setVisible(true);
        btn.style.backgroundColor = '#c154ff'; // Changement de couleur direct
        btn.style.color = 'white';
        
        if (!legend) {
            legend = document.createElement('div');
            legend.id = 'wind-legend-container';
            Object.assign(legend.style, {
                position: 'fixed', bottom: '20px', right: '20px',
                backgroundColor: 'white', padding: '12px', borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.4)', zIndex: '5000',
                minWidth: '200px', border: '2px solid #c154ff', pointerEvents: 'none'
            });
            legend.innerHTML = `
                <div style="font-size:12px; font-weight:900; margin-bottom:8px; text-align:center; color:#000; font-family:sans-serif;">VITESSE DU VENT (KM/H)</div>
                <div style="height:15px; width:100%; background: linear-gradient(to right, #f7f7f7, #d8b5ff, #c154ff, #e026ff, #ff00de, #7b00ff); border-radius:3px;"></div>
                <div style="display:flex; justify-content:space-between; font-size:10px; margin-top:5px; font-weight:bold; color:#333; font-family:sans-serif;">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100+</span>
                </div>`;
            document.body.appendChild(legend);
        }
        legend.style.display = 'block';
        if (typeof satelliteLayer !== 'undefined') satelliteLayer.setOpacity(0.6);
    } else {
        windLayer.setVisible(false);
        btn.style.backgroundColor = 'white';
        btn.style.color = 'black';
        if (legend) legend.style.display = 'none';
        if (typeof satelliteLayer !== 'undefined') satelliteLayer.setOpacity(1);
    }
}

// On force l'initialisation au chargement de la page
window.addEventListener('DOMContentLoaded', () => {
    console.log("DOM chargé, vérification du bouton vent...");
    let btn = document.getElementById('wind-toggle-btn');
    
    if (!btn) {
        console.log("Bouton absent du HTML, injection manuelle...");
        btn = document.createElement('button');
        btn.id = 'wind-toggle-btn';
        btn.innerHTML = '💨'; // Icône vent
        Object.assign(btn.style, {
            position: 'fixed',
            top: '250px', // On le place assez bas pour ne rien gêner
            left: '10px',
            zIndex: '9999',
            width: '34px',
            height: '34px',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
        });
        document.body.appendChild(btn);
    }
    
    // On lie la fonction au clic
    btn.onclick = toggleWindLayer;
});

// --- MODULE METEO MARINE & ALERTE ---
async function triggerMarineWeatherAlert(coordinate) {
    const widget = document.getElementById('weather-widget');
    if (!widget) return;

    const lonLat = ol.proj.toLonLat(coordinate);
    const [lon, lat] = lonLat;

    try {
        // --- 1. DOUBLE VÉRIFICATION (ALTITUDE + ADRESSE) ---
        // On lance les deux tests en même temps pour gagner du temps
        const [topoRes, geoRes] = await Promise.all([
            fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`),
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
        ]);

        const topoData = await topoRes.json();
        const geoData = await geoRes.json();

        const elevation = (topoData.elevation && topoData.elevation[0]) ? topoData.elevation[0] : 0;
        
        // On définit "isTerre" si on a une adresse OU si on est à plus de 1m d'altitude
        const isTerre = (geoData && geoData.address && (geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.hamlet || geoData.address.postcode)) 
                        || elevation > 1;

        if (isTerre) {
            console.log(`🏠 TERRE DÉTECTÉE (Alt: ${elevation}m / Lieu: ${geoData.display_name}) -> Bascule Ville`);
            if (typeof triggerWeatherAtLocation === "function") {
                triggerWeatherAtLocation(coordinate);
            }
            return; // ON ARRÊTE TOUT
        }

        // --- 2. SI ON EST AU LARGE ---
        console.log("🌊 LARGE CONFIRMÉ -> Mode Marine");

        const urlMarine = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&current=wave_height,wave_direction&hourly=wave_height&timezone=auto`;
        const urlVent = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=wind_speed_10m,wind_direction_10m&hourly=wind_speed_10m&wind_speed_unit=kmh&timezone=auto`;

        const [resM, resV] = await Promise.all([fetch(urlMarine), fetch(urlVent)]);
        const dataM = await resM.json();
        const dataV = await resV.json();

        if (!dataM.current) {
            triggerWeatherAtLocation(coordinate);
            return;
        }

        const v_houle = dataM.current.wave_height;
        const v_houle_dir = dataM.current.wave_direction;
        const v_vent = dataV.current.wind_speed_10m;
        const v_vent_dir = dataV.current.wind_direction_10m;

        const getStatus = (v, w) => {
            if (v > 2.5 || w > 55) return { label: "DANGER", color: "#ff4d4d", msg: "Sortie déconseillée" };
            if (v > 1.2 || w > 35) return { label: "VIGILANCE", color: "#ffa500", msg: "Mer agitée" };
            return { label: "MER CALME", color: "#adff2f", msg: "Conditions optimales" };
        };
        const status = getStatus(v_houle, v_vent);

        // --- FORECAST ---
        let forecastHTML = `<div style="display:flex; justify-content:space-between; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.2);">`;
        for (let i = 24; i <= 120; i += 24) { 
            const time = new Date(dataM.hourly.time[i]);
            forecastHTML += `
                <div style="text-align:center; flex:1;">
                    <div style="font-size:8px; opacity:0.8;">${time.getUTCDate()}/${time.getUTCMonth()+1}</div>
                    <div style="font-size:11px; color:#00f2ff; font-weight:900;">${dataM.hourly.wave_height[i].toFixed(1)}m</div>
                    <div style="font-size:9px; color:#f0f0f0; font-weight:bold;">${Math.round(dataV.hourly.wind_speed_10m[i])}<span style="font-size:6px; opacity:0.7;">km/h</span></div>
                </div>`;
        }
        forecastHTML += `</div>`;

        widget.style.display = "block";
        widget.style.border = `2px solid ${status.color}`;
        widget.style.backgroundColor = "#5d6d8e";

        widget.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <b style="font-size:9px; opacity:0.7;">METEO MARINE</b>
                <span style="background:${status.color}; color:#000; font-size:8px; padding:2px 6px; border-radius:4px; font-weight:900;">${status.label}</span>
            </div>
            <div style="margin:10px 0;">
                <b style="color:#00f2ff; font-size:16px;">Secteur de Navigation</b><br>
                <small style="color:${status.color}">${status.msg}</small>
            </div>
            <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span>Houle</span>
                    <div style="text-align:right;">
                        <b style="color:#00f2ff;">${v_houle.toFixed(1)} m</b>
                        <div style="font-size:10px; opacity:0.8;">
                            ${getCardinalDir(v_houle_dir)} <span style="display:inline-block; transform:rotate(${v_houle_dir}deg);">↓</span>
                        </div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Vent</span>
                    <div style="text-align:right;">
                        <b style="color:#f0f0f0;">${Math.round(v_vent)} km/h</b>
                        <div style="font-size:10px; opacity:0.8;">
                            ${getCardinalDir(v_vent_dir)} <span style="display:inline-block; transform:rotate(${v_vent_dir}deg);">↓</span>
                        </div>
                    </div>
                </div>
            </div>
            <div style="font-size:8px; opacity:0.7; margin-bottom:5px; font-weight:bold;">PRÉVISIONS (24H)</div>
            
            ${forecastHTML}
            <div style="width: 100%; font-size: 8px; opacity: 0.4; text-align: right; margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
            SOURCES : OPENWEATHER & OPEN-METEO MARINE
            </div>`;

    } catch (e) { 
        console.error("Erreur globale :", e);
        triggerWeatherAtLocation(coordinate);
    }
}