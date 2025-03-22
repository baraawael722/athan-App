// Initialize map
const map = L.map('map').setView([31.04, 31.37], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let currentMarker = null;
let currentLat = 31.0419; // Default latitude (Mansoura)
let currentLng = 31.3785; // Default longitude (Mansoura)

// Change interface
function changeInterface(interface) {
    document.body.className = interface;
}

// Prayer times calculation function (corrected)
function calculatePrayerTimes(lat, lng, date, method, height = null) {
    const d = date.getUTCDate(); // Use UTC to avoid local time issues
    const m = date.getUTCMonth() + 1; // Months are 0-based in JS
    const y = date.getUTCFullYear();

    // Julian Day calculation (more precise)
    const a = Math.floor((14 - m) / 12);
    const yAdjusted = y + 4800 - a;
    const mAdjusted = m + 12 * a - 3;
    const JD = d + Math.floor((153 * mAdjusted + 2) / 5) + 365 * yAdjusted + Math.floor(yAdjusted / 4) - Math.floor(yAdjusted / 100) + Math.floor(yAdjusted / 400) - 32045 + 0.5;

    const n = JD - 2451545.0; // Days since J2000.0
    const L = (280.466 + 0.9856474 * n) % 360; // Mean longitude
    const g = (357.528 + 0.9856003 * n) % 360; // Mean anomaly
    const λ = (L + 1.915 * Math.sin(g * Math.PI / 180) + 0.020 * Math.sin(2 * g * Math.PI / 180)) % 360; // Ecliptic longitude
    const ε = 23.439 - 0.0000004 * n; // Obliquity of ecliptic
    const α = Math.atan2(Math.cos(ε * Math.PI / 180) * Math.sin(λ * Math.PI / 180), Math.cos(λ * Math.PI / 180)) * 180 / Math.PI; // Right ascension
    const δ = Math.asin(Math.sin(ε * Math.PI / 180) * Math.sin(λ * Math.PI / 180)) * 180 / Math.PI; // Declination

    // Equation of Time (more precise)
    const EoT = (L - α + 0.017 * Math.sin(2 * λ * Math.PI / 180)) * 4; // in minutes
    const timezone = 2; // Egypt timezone (UTC+2)
    const referenceLongitude = timezone * 15;
    const longitudeCorrection = (lng - referenceLongitude) * 4 / 60;
    const solarNoon = 12 - (EoT / 60) - longitudeCorrection;

    // Adjust sunrise/sunset and fajr/isha angles based on height
    let sunriseAngle = -0.833; // Default angle at sea level
    let fajrAngle = method === "egypt" ? 19.5 : (method === "hanafi" ? 19.5 : 18);
    let ishaAngle = method === "egypt" ? 17.5 : (method === "hanafi" ? 17.5 : 18);

    if (height !== null && height >= 0) {
        const TSL = 288.15; // Standard temperature at sea level (Kelvin)
        const PSL = 1013.25; // Standard pressure at sea level (hPa)
        const Th = TSL - 0.0065 * height; // Temperature at height
        const Ph = PSL * Math.pow(1 - 0.0065 * height / TSL, 5.255); // Pressure at height
        const refractionCorrection = 0.5 * Math.sqrt(height) * (Ph / PSL) * (TSL / Th);
        sunriseAngle -= refractionCorrection / 60;
        fajrAngle += refractionCorrection / 60;
        ishaAngle += refractionCorrection / 60;
    }

    const H_sunrise = Math.acos(
        (Math.sin(sunriseAngle * Math.PI / 180) - Math.sin(lat * Math.PI / 180) * Math.sin(δ * Math.PI / 180)) /
        (Math.cos(lat * Math.PI / 180) * Math.cos(δ * Math.PI / 180))
    ) * 180 / Math.PI;
    const sunrise = solarNoon - H_sunrise / 15;
    const sunset = solarNoon + H_sunrise / 15;

    const H_fajr = Math.acos(
        (Math.sin(-fajrAngle * Math.PI / 180) - Math.sin(lat * Math.PI / 180) * Math.sin(δ * Math.PI / 180)) /
        (Math.cos(lat * Math.PI / 180) * Math.cos(δ * Math.PI / 180))
    ) * 180 / Math.PI;
    const H_isha = Math.acos(
        (Math.sin(-ishaAngle * Math.PI / 180) - Math.sin(lat * Math.PI / 180) * Math.sin(δ * Math.PI / 180)) /
        (Math.cos(lat * Math.PI / 180) * Math.cos(δ * Math.PI / 180))
    ) * 180 / Math.PI;

    const fajr = solarNoon - H_fajr / 15;
    const isha = solarNoon + H_isha / 15;
    const maghrib = sunset;

    const asrFactor = method === "hanafi" ? 2 : 1;
    const shadowAngle = Math.atan(asrFactor + Math.tan(Math.abs(lat - δ) * Math.PI / 180));
    const H_asr = Math.acos(
        (Math.sin(shadowAngle) - Math.sin(lat * Math.PI / 180) * Math.sin(δ * Math.PI / 180)) /
        (Math.cos(lat * Math.PI / 180) * Math.cos(δ * Math.PI / 180))
    ) * 180 / Math.PI;
    const asr = solarNoon + H_asr / 15;

    function toTime(t) {
        t = (t + 24) % 24;
        const h = Math.floor(t);
        const m = Math.floor((t - h) * 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    return {
        "Fajr": toTime(fajr),
        "Sunrise": toTime(sunrise),
        "Dhuhr": toTime(solarNoon),
        "Asr": toTime(asr),
        "Maghrib": toTime(maghrib),
        "Isha": toTime(isha)
    };
}

// Reverse Geocoding
async function getCityName(lat, lng) {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
    const data = await response.json();
    return data.display_name || "موقع غير معروف";
}

// Display prayer times
async function showPrayerTimes(lat, lng, applyHeight = false) {
    currentLat = lat;
    currentLng = lng;

    const date = new Date(); // Current date (e.g., March 22, 2025)
    const method = document.getElementById('method').value;
    const heightInput = document.getElementById('height-input').value;
    const height = applyHeight && heightInput ? parseFloat(heightInput) : null;
    const times = calculatePrayerTimes(lat, lng, date, method, height);
    const city = await getCityName(lat, lng);
    const prayerDiv = document.getElementById('prayer-times');
    const heightMessage = height !== null ? `تم الحساب باستخدام الارتفاع: ${height} متر` : "تم الحساب بدون ارتفاع";
    prayerDiv.innerHTML = `
        <h2>مواقيت الصلاة في ${city}</h2>
        <p>التاريخ: ${date.toLocaleDateString('ar-EG')}</p>
        <p style="font-size: 18px; color: #888;">${heightMessage}</p>
        <p><i class="fas fa-moon"></i> الفجر: ${times.Fajr}</p>
        <p><i class="fas fa-sun"></i> الشروق: ${times.Sunrise}</p>
        <p><i class="fas fa-cloud-sun"></i> الظهر: ${times.Dhuhr}</p>
        <p><i class="fas fa-cloud"></i> العصر: ${times.Asr}</p>
        <p><i class="fas fa-sunset"></i> المغرب: ${times.Maghrib}</p>
        <p><i class="fas fa-star-and-crescent"></i> العشاء: ${times.Isha}</p>
        <button onclick="saveFavorite('${city}', ${lat}, ${lng})"><i class="fas fa-heart"></i> حفظ كمفضل</button>
    `;
    if (currentMarker) map.removeLayer(currentMarker);
    currentMarker = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 10);
}

// Apply height changes
function applyHeight() {
    const heightInput = document.getElementById('height-input').value;
    if (!currentLat || !currentLng) {
        alert("يرجى اختيار موقع أولاً!");
        return;
    }
    if (heightInput === "") {
        alert("يرجى إدخال قيمة للارتفاع أو اتركه فارغًا لحساب بدون ارتفاع!");
        return;
    }
    showPrayerTimes(currentLat, currentLng, true);
}

// Map click handler
map.on('click', async function(e) {
    showPrayerTimes(e.latlng.lat, e.latlng.lng);
});

// Search function
async function searchCity() {
    const query = document.getElementById('search-input').value;
    const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json`);
    const data = await response.json();
    if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        showPrayerTimes(lat, lng);
    } else {
        alert("لم يتم العثور على المدينة!");
    }
}

// Favorites management
function saveFavorite(name, lat, lng) {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    favorites.push({ name, lat, lng });
    localStorage.setItem('favorites', JSON.stringify(favorites));
    updateFavoritesList();
}

function updateFavoritesList() {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const list = document.getElementById('favorites-list');
    list.innerHTML = '';
    favorites.forEach(fav => {
        const li = document.createElement('li');
        li.innerHTML = `${fav.name} <button onclick="showPrayerTimes(${fav.lat}, ${fav.lng})"><i class="fas fa-eye"></i> عرض</button>`;
        list.appendChild(li);
    });
}

updateFavoritesList();
showPrayerTimes(31.0419, 31.3785);