// Initialize the map centered on NYC
const map = L.map('map').setView([40.7128, -74.0060], 12);

// API URL base - change this for production
const API_BASE_URL = 'http://localhost:3000/api';

// Check if Mapbox is configured
let mapboxToken = null;

// Add tile layer (will use Mapbox if available, otherwise OpenStreetMap)
function initializeMap() {
    // Default to OpenStreetMap tiles
    let tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    
    // Try to fetch mapbox configuration
    fetch(`${API_BASE_URL}/config`)
        .then(response => response.json())
        .then(config => {
            if (config.mapboxToken) {
                // If Mapbox is configured, use it instead
                mapboxToken = config.mapboxToken;
                map.removeLayer(tileLayer);
                
                tileLayer = L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/streets-v11/tiles/{z}/{x}/{y}?access_token=' + mapboxToken, {
                    attribution: '&copy; <a href="https://www.mapbox.com/map-feedback/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                    tileSize: 512,
                    zoomOffset: -1
                }).addTo(map);
                
                console.log('Using Mapbox tiles');
            } else {
                console.log('Using OpenStreetMap tiles (Mapbox not configured)');
            }
        })
        .catch(error => {
            console.error('Error fetching configuration:', error);
            console.log('Using OpenStreetMap tiles as fallback');
        });
    
    // Add the default tile layer
    tileLayer.addTo(map);
}

// Initialize the map
initializeMap();

// Variables to store state
let officeMarker = null;
let apartmentMarkers = [];
let apartmentData = [];
let officeCoordinates = null;

// DOM elements
const officeAddressInput = document.getElementById('office-address');
const searchBtn = document.getElementById('search-btn');
const maxCommuteSlider = document.getElementById('max-commute');
const maxPriceSlider = document.getElementById('max-price');
const commuteValueSpan = document.getElementById('commute-value');
const priceValueSpan = document.getElementById('price-value');
const apartmentList = document.getElementById('apartment-list');
const loadingOverlay = document.getElementById('loading-overlay');

// Update slider value displays
maxCommuteSlider.addEventListener('input', () => {
    commuteValueSpan.textContent = `${maxCommuteSlider.value} min`;
    filterApartments();
});

maxPriceSlider.addEventListener('input', () => {
    priceValueSpan.textContent = `$${maxPriceSlider.value}`;
    filterApartments();
});

// Search for apartments when the button is clicked
searchBtn.addEventListener('click', async () => {
    const officeAddress = officeAddressInput.value.trim();
    
    if (!officeAddress) {
        alert('Please enter your office address');
        return;
    }
    
    // Display loading message and overlay
    apartmentList.innerHTML = '<div class="loading-message">Searching for apartments...</div>';
    loadingOverlay.style.display = 'flex';
    
    // Clear previous markers
    clearMarkers();
    
    try {
        // Step 1: Geocode the office address
        const geocodeResponse = await fetch(`${API_BASE_URL}/geocode?address=${encodeURIComponent(officeAddress)}`);
        
        if (!geocodeResponse.ok) {
            throw new Error('Failed to geocode address');
        }
        
        const geocodeData = await geocodeResponse.json();
        officeCoordinates = geocodeData.coordinates;
        
        // Add office marker to the map
        addOfficeMarker(officeCoordinates);
        
        // Step 2: Search for apartments near the office
        const apartmentsResponse = await fetch(
            `${API_BASE_URL}/apartments?latitude=${officeCoordinates[0]}&longitude=${officeCoordinates[1]}&radius=5`
        );
        
        if (!apartmentsResponse.ok) {
            throw new Error('Failed to fetch apartments');
        }
        
        apartmentData = await apartmentsResponse.json();
        
        console.log('Apartment data received:', apartmentData);
        console.log('Number of apartments:', apartmentData.length);
        if (apartmentData.length > 0) {
            console.log('First apartment:', apartmentData[0]);
        }
        
        // Step 3: Calculate commute times
        if (apartmentData.length > 0) {
            // Extract coordinates for commute time calculation
            const destinationsCoordinates = apartmentData.map(apt => apt.coordinates);
            
            const commuteResponse = await fetch(`${API_BASE_URL}/commute-times`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    origin: officeCoordinates,
                    destinations: destinationsCoordinates
                })
            });
            
            if (!commuteResponse.ok) {
                // If commute API fails, use fallback distance calculation
                calculateCommuteTimes(officeCoordinates);
            } else {
                const commuteTimes = await commuteResponse.json();
                
                // Add commute times to apartment data
                commuteTimes.forEach(time => {
                    if (apartmentData[time.index]) {
                        apartmentData[time.index].commuteTime = time.durationMinutes;
                        
                        // Add extra information if available
                        if (time.durationText) {
                            apartmentData[time.index].commuteTimeText = time.durationText;
                        }
                        if (time.distanceText) {
                            apartmentData[time.index].distanceText = time.distanceText;
                        }
                    }
                });
            }
        } else {
            // No apartments found
            apartmentList.innerHTML = '<div class="loading-message">No apartments found in this area.</div>';
            return;
        }
        
        // Display apartments on the map and in the list
        displayApartments();
        
        // Add legend to the map
        addLegendToMap();
        
    } catch (error) {
        console.error('Error:', error);
        apartmentList.innerHTML = `<div class="loading-message">Error: ${error.message}. Try again later.</div>`;
    } finally {
        // Hide loading overlay
        loadingOverlay.style.display = 'none';
    }
});

// Calculate fallback commute times based on distance from office
function calculateCommuteTimes(officeCoordinates) {
    apartmentData.forEach(apartment => {
        // Calculate distance in kilometers using Haversine formula
        const distance = calculateDistance(
            officeCoordinates[0], officeCoordinates[1],
            apartment.coordinates[0], apartment.coordinates[1]
        );
        
        // Simulate commute time based on distance (very rough approximation)
        apartment.commuteTime = Math.round(distance * 5); // ~5 minutes per km as a rough estimate
        
        // Add some randomness to make it more realistic
        apartment.commuteTime += Math.floor(Math.random() * 10);
    });
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the Earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Display apartments on the map and in the list
function displayApartments() {
    // Clear previous markers
    clearApartmentMarkers();
    
    console.log('Filtering apartments...');
    console.log('Max commute time:', parseInt(maxCommuteSlider.value), 'minutes');
    console.log('Max price:', parseInt(maxPriceSlider.value));
    
    const maxCommute = parseInt(maxCommuteSlider.value);
    const maxPrice = parseInt(maxPriceSlider.value);
    
    // More permissive filtering that handles missing data better
    const filteredApartments = apartmentData.filter(apt => {
        // If commute time is missing, assume it's within range
        const commuteInRange = apt.commuteTime === null || apt.commuteTime === undefined || apt.commuteTime <= maxCommute;
        
        // If price is missing or invalid, include it when price filter is at max, otherwise exclude
        let priceInRange = false;
        
        if (apt.price === null || apt.price === undefined || isNaN(apt.price) || apt.price === 0) {
            // Include the apartment if the price filter is at its maximum
            priceInRange = maxPrice === 5000; // Assuming 5000 is the max value of slider
        } else {
            priceInRange = apt.price <= maxPrice;
        }
        
        return commuteInRange && priceInRange;
    });
    
    console.log('Filtered apartments:', filteredApartments.length);
    if (filteredApartments.length === 0) {
        console.log('No apartments after filtering');
        console.log('Apartment data:', apartmentData);
        
        // Check if there are any apartments with commute times and prices
        const hasCommuteTime = apartmentData.filter(apt => apt.commuteTime !== null && apt.commuteTime !== undefined);
        const validPrices = apartmentData.filter(apt => apt.price !== null && apt.price !== undefined && !isNaN(apt.price));
        
        console.log('Apartments with commute times:', hasCommuteTime.length);
        console.log('Apartments with valid prices:', validPrices.length);
        
        apartmentList.innerHTML = '<div class="loading-message">No apartments found matching your criteria.</div>';
    } else {
        apartmentList.innerHTML = '';
        
        filteredApartments.forEach(apartment => {
            // Add marker to map
            addApartmentMarker(apartment);
            
            // Add to list
            const card = document.createElement('div');
            card.className = 'apartment-card';
            
            // Format the bedroom text appropriately
            const bedroomText = apartment.bedrooms === 0 ? 'Studio' : `${apartment.bedrooms} BR`;
            
            // Format square footage
            const sqftText = apartment.sqft === 'N/A' ? 'N/A' : `${apartment.sqft} sqft`;
            
            // Create image element if available
            let imageHtml = '';
            if (apartment.imgSrc) {
                imageHtml = `<div class="apartment-image" style="background-image: url('${apartment.imgSrc}')"></div>`;
            }
            
            card.innerHTML = `
                ${imageHtml}
                <h3>${apartment.title}</h3>
                <div class="details">
                    ${bedroomText} | ${apartment.bathrooms} Bath | ${sqftText}
                </div>
                <div class="details">${apartment.address}</div>
                <div class="price">$${apartment.price}/month</div>
                <div class="commute">Commute: ${apartment.commuteTime} minutes</div>
            `;
            
            // Add extra information if available
            if (apartment.commuteTimeText || apartment.distanceText) {
                const extraInfo = document.createElement('div');
                extraInfo.className = 'extra-info';
                extraInfo.textContent = [
                    apartment.commuteTimeText,
                    apartment.distanceText
                ].filter(Boolean).join(' | ');
                
                card.appendChild(extraInfo);
            }
            
            // Add click event to highlight on map
            card.addEventListener('click', () => {
                // Find the marker for this apartment
                const marker = apartmentMarkers.find(m => m.apartmentId === apartment.id);
                if (marker) {
                    marker.openPopup();
                    map.setView(apartment.coordinates, 14);
                }
            });
            
            apartmentList.appendChild(card);
        });
    }
}

// Add office marker to the map
function addOfficeMarker(coordinates) {
    // Make sure coordinates are valid
    if (!coordinates || 
        !Array.isArray(coordinates) || 
        coordinates.length !== 2 ||
        isNaN(coordinates[0]) || 
        isNaN(coordinates[1])) {
        console.error('Invalid office coordinates:', coordinates);
        return;
    }
    
    // Clear previous office marker
    if (officeMarker) {
        map.removeLayer(officeMarker);
    }
    
    // Create a custom office icon
    const officeIcon = L.divIcon({
        className: 'office-marker',
        html: '<div style="background-color: #2c3e50; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white;"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
    
    // Add new marker
    officeMarker = L.marker(coordinates, { icon: officeIcon }).addTo(map);
    officeMarker.bindPopup('<strong>Your Office</strong>');
    
    // Zoom and center map to include the marker
    map.setView(coordinates, 12);
}

// Add apartment marker to the map
function addApartmentMarker(apartment) {
    // Make sure coordinates are valid
    if (!apartment.coordinates || 
        !Array.isArray(apartment.coordinates) || 
        apartment.coordinates.length !== 2 ||
        isNaN(apartment.coordinates[0]) || 
        isNaN(apartment.coordinates[1])) {
        console.error('Invalid coordinates for apartment:', apartment);
        return;
    }
    
    // Create marker color based on commute time
    const color = getMarkerColor(apartment.commuteTime);
    
    // Create a custom apartment icon
    const apartmentIcon = L.divIcon({
        className: 'apartment-marker',
        html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
    });
    
    // Add marker to map
    const marker = L.marker(apartment.coordinates, { icon: apartmentIcon }).addTo(map);
    
    // Format the bedroom text appropriately
    const bedroomText = apartment.bedrooms === 0 ? 'Studio' : `${apartment.bedrooms} BR`;
    
    // Format square footage
    const sqftText = apartment.sqft === 'N/A' ? 'N/A' : `${apartment.sqft} sqft`;
    
    // Add popup with apartment details
    marker.bindPopup(`
        <strong>${apartment.title}</strong><br>
        ${bedroomText} | ${apartment.bathrooms} Bath | ${sqftText}<br>
        <strong>$${apartment.price}/month</strong><br>
        Commute: ${apartment.commuteTime} minutes
        ${apartment.commuteTimeText ? `<br>${apartment.commuteTimeText}` : ''}
        ${apartment.distanceText ? `<br>${apartment.distanceText}` : ''}
    `);
    
    // Store apartment ID with marker for reference
    marker.apartmentId = apartment.id;
    
    // Add to markers array
    apartmentMarkers.push(marker);
}

// Get marker color based on commute time
function getMarkerColor(commuteTime) {
    if (commuteTime <= 20) {
        return '#27ae60'; // Green for short commute
    } else if (commuteTime <= 40) {
        return '#f1c40f'; // Yellow for medium commute
    } else {
        return '#e74c3c'; // Red for long commute
    }
}

// Add legend to the map
function addLegendToMap() {
    const legend = L.control({ position: 'bottomright' });
    
    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'legend');
        div.innerHTML = `
            <h4>Commute Time</h4>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #27ae60;"></div>
                <span>< 20 minutes</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #f1c40f;"></div>
                <span>20-40 minutes</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #e74c3c;"></div>
                <span>> 40 minutes</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #3498db;"></div>
                <span>Your Office</span>
            </div>
        `;
        return div;
    };
    
    legend.addTo(map);
}

// Clear all apartment markers
function clearApartmentMarkers() {
    apartmentMarkers.forEach(marker => {
        map.removeLayer(marker);
    });
    apartmentMarkers = [];
}

// Clear all markers
function clearMarkers() {
    clearApartmentMarkers();
    if (officeMarker) {
        map.removeLayer(officeMarker);
        officeMarker = null;
    }
}

// Filter apartments based on current slider values
function filterApartments() {
    // Only filter if we have apartment data loaded
    if (apartmentData.length > 0) {
        displayApartments();
    }
}
