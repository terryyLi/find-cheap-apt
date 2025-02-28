require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// API Routes

// 1. Geocode an address (using Google Maps API)
app.get('/api/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return res.json({
        coordinates: [location.lat, location.lng],
        formattedAddress: response.data.results[0].formatted_address
      });
    }
    
    return res.status(404).json({ error: 'Location not found' });
    
  } catch (error) {
    console.error('Error geocoding address:', error);
    return res.status(500).json({ error: 'Failed to geocode address' });
  }
});

// 2. Search for apartments near location (using Zillow API)
app.get('/api/apartments', async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    
    // If RapidAPI is not available, fall back to sample data immediately
    if (!apiStatus.rapidApiAvailable) {
      console.log('RapidAPI is not available, using sample data');
      const sampleData = require('./sample-data.js');
      return res.json(sampleData);
    }
    
    // Step 1: Convert coordinates to a location name using Google Maps Geocoding API
    let locationName = 'New York, NY'; // Default fallback
    
    try {
      const geocodeResponse = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`);
      
      if (geocodeResponse.data.status === 'OK' && geocodeResponse.data.results.length > 0) {
        // Extract city and state from address components
        const addressComponents = geocodeResponse.data.results[0].address_components;
        let city = null;
        let state = null;
        
        for (const component of addressComponents) {
          if (component.types.includes('locality')) {
            city = component.long_name;
          }
          if (component.types.includes('administrative_area_level_1')) {
            state = component.short_name;
          }
        }
        
        if (city && state) {
          locationName = `${city}, ${state}`;
          console.log(`Searching for properties in: ${locationName}`);
        } else {
          // Use formatted address as fallback
          locationName = geocodeResponse.data.results[0].formatted_address;
          console.log(`Couldn't extract city/state. Using: ${locationName}`);
        }
      }
    } catch (error) {
      console.error('Error reverse geocoding coordinates:', error.message);
      console.log(`Using default location: ${locationName}`);
    }
    
    // Step 2: Use Zillow API to search for properties in that location
    const options = {
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: locationName,
        home_type: 'Apartments,Condos,Townhomes', // Focus on rental-friendly property types
        status_type: 'ForRent' // Specifically search for rental properties
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'zillow-com1.p.rapidapi.com'
      }
    };
    
    console.log(`Searching Zillow API for properties in: ${locationName}`);
    const response = await axios.request(options);
    
    // Log some details about the response to help with debugging
    if (response.data && response.data.props) {
      console.log(`Found ${response.data.props.length} properties from Zillow API`);
      
      // Log the structure of the first property for debugging
      if (response.data.props.length > 0) {
        const sampleProperty = response.data.props[0];
        console.log('Sample property data structure:');
        console.log(JSON.stringify(sampleProperty, null, 2));
      }
    } else {
      console.log('Unexpected Zillow API response format:', JSON.stringify(response.data).substring(0, 300));
    }
    
    if (!response.data || !response.data.props || response.data.props.length === 0) {
      console.log(`No properties found for location: ${locationName}. Trying a broader search...`);
      
      // Try a broader search by state if no results
      const stateMatch = locationName.match(/, ([A-Z]{2})$/);
      if (stateMatch && stateMatch[1]) {
        options.params.location = stateMatch[1];
        const stateResponse = await axios.request(options);
        if (stateResponse.data && stateResponse.data.props && stateResponse.data.props.length > 0) {
          response.data = stateResponse.data;
        }
      }
    }
    
    // Check again if we have properties
    if (!response.data || !response.data.props || response.data.props.length === 0) {
      console.log('No properties found. Falling back to sample data.');
      const sampleData = require('./sample-data.js');
      return res.json(sampleData);
    }
    
    // Step 3: Format the response to match our application's data structure
    const formattedApartments = (response.data.props || []).map(property => {
      // Handle different price formats safely for rentals
      let price = 0;
      
      // For rental properties, we prioritize rentZestimate or price
      if (property.rentZestimate) {
        price = property.rentZestimate;
      } else if (property.price) {
        if (typeof property.price === 'string') {
          // If the price is a string, parse it assuming it might be a formatted string like "$1,250/mo"
          const numericValue = property.price.replace(/[^\d.]/g, '');
          price = parseInt(numericValue) || 0;
          
          // If the price seems too high for a rental (like 140000), assume it's per year and divide
          if (price > 20000) {
            price = Math.round(price / 12);
          }
        } else if (typeof property.price === 'number') {
          price = property.price;
          
          // If the price seems too high for a rental, assume it's per year or a property for sale
          if (price > 20000) {
            price = Math.round(price / 12);
          }
        }
      }
      
      // Ensure we have valid coordinates
      const latitude = property.latitude || parseFloat(latitude);
      const longitude = property.longitude || parseFloat(longitude);
      
      // Determine property type for better title display
      let propertyType = 'Apartment';
      if (property.propertyType) {
        if (property.propertyType === 'APARTMENT' || property.propertyType === 'MULTI_FAMILY') {
          propertyType = 'Apartment';
        } else if (property.propertyType === 'CONDO' || property.propertyType === 'TOWNHOUSE') {
          propertyType = property.propertyType.charAt(0) + property.propertyType.slice(1).toLowerCase();
        } else {
          propertyType = property.propertyType.charAt(0) + property.propertyType.slice(1).toLowerCase().replace('_', ' ');
        }
      } else if (property.homeType) {
        propertyType = property.homeType;
      }
      
      // Create a more descriptive title
      const bedroomText = property.bedrooms ? `${property.bedrooms} BR` : 'Studio';
      const title = `${bedroomText} ${propertyType} for Rent`;
      
      return {
        id: property.zpid || String(Math.random()),
        title: title,
        address: property.address || 'Address not provided',
        coordinates: [latitude, longitude],
        price: price,
        bedrooms: property.bedrooms || 0,
        bathrooms: property.bathrooms || 1,
        sqft: property.livingArea || 'N/A',
        imgSrc: property.imgSrc || null,
        commuteTime: null // Will be calculated client-side or with another API call
      };
    });
    
    // Log the formatted apartments for debugging
    console.log(`Formatted ${formattedApartments.length} apartments for client`);
    
    // Check for valid coordinates in the formatted apartments
    const validCoordinates = formattedApartments.filter(apt => 
      Array.isArray(apt.coordinates) && 
      apt.coordinates.length === 2 && 
      !isNaN(apt.coordinates[0]) && 
      !isNaN(apt.coordinates[1])
    );
    
    console.log(`Apartments with valid coordinates: ${validCoordinates.length}/${formattedApartments.length}`);
    
    if (formattedApartments.length > 0) {
      console.log('Sample apartment data:', JSON.stringify(formattedApartments[0], null, 2));
    }
    
    return res.json(formattedApartments);
    
  } catch (error) {
    console.error('Error fetching apartments:', error);
    console.log('Falling back to sample data');
    
    // If the API fails, return a fallback with sample data
    const sampleData = require('./sample-data.js');
    return res.json(sampleData);
  }
});

// Test endpoint to directly query Zillow API with a location
app.get('/api/test-zillow', async (req, res) => {
  try {
    const { location } = req.query;
    
    if (!location) {
      return res.status(400).json({ error: 'Location parameter is required' });
    }
    
    console.log(`Testing Zillow API for location: ${location}`);
    
    const options = {
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyExtendedSearch',
      params: {
        location: location,
        home_type: 'Apartments,Condos,Townhomes',
        status_type: 'ForRent' // Search for rental properties
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'zillow-com1.p.rapidapi.com'
      }
    };
    
    const response = await axios.request(options);
    
    // Return the raw API response for testing
    return res.json({
      success: true,
      propertyCount: response.data.props ? response.data.props.length : 0,
      sampleProperty: response.data.props && response.data.props.length > 0 ? response.data.props[0] : null,
      rawResponse: response.data
    });
    
  } catch (error) {
    console.error('Error testing Zillow API:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 3. Calculate commute times from origin to multiple destinations (using Google Maps API)
app.post('/api/commute-times', async (req, res) => {
  try {
    const { origin, destinations } = req.body;
    
    if (!origin || !destinations || !Array.isArray(destinations)) {
      return res.status(400).json({ error: 'Origin and destinations array are required' });
    }
    
    // Prepare destination string for Google Maps API
    const destinationsStr = destinations
      .map(dest => `${dest[0]},${dest[1]}`)
      .join('|');
    
    const originStr = `${origin[0]},${origin[1]}`;
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destinationsStr}&mode=transit&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.status === 'OK') {
      const commuteTimes = response.data.rows[0].elements.map((element, index) => {
        if (element.status === 'OK') {
          return {
            index,
            durationText: element.duration.text,
            durationMinutes: Math.round(element.duration.value / 60),
            distanceText: element.distance.text
          };
        }
        return { 
          index, 
          error: 'Route not found',
          // Fallback to a distance-based estimate
          durationMinutes: Math.round(calculateDistance(
            origin[0], origin[1], 
            destinations[index][0], destinations[index][1]
          ) * 5) // ~5 minutes per km as a rough estimate
        };
      });
      
      return res.json(commuteTimes);
    }
    
    return res.status(500).json({ error: 'Failed to calculate commute times' });
    
  } catch (error) {
    console.error('Error calculating commute times:', error);
    
    // Fallback to distance-based calculations
    const { origin, destinations } = req.body;
    const fallbackTimes = destinations.map((dest, index) => ({
      index,
      durationMinutes: Math.round(calculateDistance(
        origin[0], origin[1], dest[0], dest[1]
      ) * 5), // ~5 minutes per km as a rough estimate
      fallback: true
    }));
    
    return res.json(fallbackTimes);
  }
});

// 4. Configuration endpoint for frontend
app.get('/api/config', (req, res) => {
  // Only send necessary configuration to the frontend
  const config = {
    // Only include mapboxToken if it's actually set
    ...(process.env.MAPBOX_ACCESS_TOKEN && process.env.MAPBOX_ACCESS_TOKEN !== 'your_mapbox_token_here' 
      ? { mapboxToken: process.env.MAPBOX_ACCESS_TOKEN } 
      : {})
  };
  
  res.json(config);
});

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

function deg2rad(deg) {
  return deg * (Math.PI/180);
}

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Function to test if the Google Maps API key is working
async function testGoogleMapsApiKey() {
  try {
    console.log('Testing Google Maps API key...');
    const testAddress = 'Empire State Building, NY';
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(testAddress)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      console.log('✅ Google Maps API key is working!');
      console.log(`Test geocoding result for "${testAddress}":`);
      console.log(`- Address: ${response.data.results[0].formatted_address}`);
      console.log(`- Coordinates: ${location.lat}, ${location.lng}`);
    } else {
      console.error('❌ Google Maps API key test failed with status:', response.data.status);
      console.error('Error message:', response.data.error_message || 'No error message provided');
    }
  } catch (error) {
    console.error('❌ Google Maps API key test failed:');
    console.error(error.response?.data || error.message);
  }
}

// Function to test if the RapidAPI key is working
async function testRapidApiKey() {
  try {
    console.log('Testing RapidAPI key...');
    
    // Using Zillow API from RapidAPI with the correct endpoint
    const options = {
      method: 'GET',
      url: 'https://zillow-com1.p.rapidapi.com/propertyFloorPlan',
      params: {
        property_url: 'https://www.zillow.com/homedetails/6361-Blucher-Ave-Van-Nuys-CA-91411/19971282_zpid/'
      },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'zillow-com1.p.rapidapi.com'
      }
    };

    const response = await axios.request(options);
    
    if (response.data) {
      console.log('✅ RapidAPI key is working with Zillow API!');
      console.log(`Test result: Successfully fetched property data`);
      apiStatus.rapidApiAvailable = true;
      
      // Show a preview of the data
      console.log('Sample data:');
      console.log(JSON.stringify(response.data).substring(0, 200) + '...');
    } else {
      console.warn('⚠️ RapidAPI returned unexpected data format:');
      console.warn(JSON.stringify(response.data, null, 2).substring(0, 200) + '...');
      apiStatus.rapidApiAvailable = false;
    }
  } catch (error) {
    console.error('❌ RapidAPI key test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Error data:', error.response.data);
      
      // Provide more helpful information for subscription errors
      if (error.response.status === 403) {
        console.log('\n===== RAPIDAPI SUBSCRIPTION REQUIRED =====');
        console.log('You need to subscribe to the Zillow API on RapidAPI:');
        console.log('1. Go to https://rapidapi.com/apimaker/api/zillow-com1/');
        console.log('2. Sign in with your RapidAPI account');
        console.log('3. Subscribe to a plan (they offer a free tier)');
        console.log('4. Once subscribed, your existing API key should work');
        console.log('================================================\n');
      }
    } else if (error.request) {
      console.error('No response received');
    } else {
      console.error('Error message:', error.message);
    }
    
    console.log('Note: The application will fall back to sample data if the API fails.');
    apiStatus.rapidApiAvailable = false;
  }
}

// Function to test if the Mapbox token is working
async function testMapboxToken() {
  try {
    console.log('Testing Mapbox access token...');
    
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    
    if (!mapboxToken || mapboxToken.includes('your_mapbox_token_here')) {
      console.warn('⚠️ Mapbox token not configured. This is optional but recommended for better maps.');
      return;
    }
    
    // Test the Mapbox Geocoding API
    const response = await axios.get(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/Empire%20State%20Building.json?access_token=${mapboxToken}`
    );
    
    if (response.data && response.data.features && response.data.features.length > 0) {
      console.log('✅ Mapbox access token is working!');
      const feature = response.data.features[0];
      console.log(`Test geocoding result: ${feature.place_name}`);
      console.log(`Coordinates: ${feature.center[1]}, ${feature.center[0]}`);
    } else {
      console.warn('⚠️ Mapbox API returned unexpected data format');
    }
  } catch (error) {
    console.error('❌ Mapbox access token test failed:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Error message:', error.response.data.message || 'No specific error message');
    } else {
      console.error('Error message:', error.message);
    }
    console.log('Note: Mapbox is optional, the application will use OpenStreetMap as a fallback.');
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Test API keys
  testGoogleMapsApiKey();
  testRapidApiKey();
  testMapboxToken();
});

const apiStatus = {
  rapidApiAvailable: false
};
