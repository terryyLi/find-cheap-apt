# NYC Apartment Finder

A web application to help you find apartments in NYC based on your office location, visualizing both rent costs and commute times on an interactive map.

## Features

- Input your office address to find nearby apartments
- Visualize apartments on an interactive map
- Color-coded markers based on commute time
- Filter apartments by maximum commute time and rent
- Display detailed apartment information
- Responsive design that works on mobile devices

## How to Use

1. Open `index.html` in your web browser
2. Enter your office address in the search box
3. Click "Find Apartments" to see available options
4. Use the sliders to filter by maximum commute time and rent
5. Click on an apartment card or map marker to see more details

## API Keys Required

This application uses several APIs that require keys:

1. **Google Maps API** - For geocoding addresses and calculating commute times
   - Sign up at [Google Cloud Platform](https://console.cloud.google.com/)
   - Enable the Geocoding API and Distance Matrix API
   - Create an API key with appropriate restrictions

2. **RapidAPI** - For apartment listing data
   - Sign up at [RapidAPI](https://rapidapi.com/)
   - Subscribe to a real estate API such as "Realty Mole Property API" or "Apartments.com"
   - Get your API key

## Installation and Setup

1. Clone the repository
2. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
3. Edit the `.env` file and add your API keys
4. Install dependencies:
   ```
   npm install
   ```
5. Start the server:
   ```
   npm start
   ```
6. Open your browser to `http://localhost:3000`

## Technical Details

This application uses:
- HTML, CSS, and JavaScript
- Leaflet.js for map visualization
- Simulated apartment data (in a real application, this would be replaced with real data from an API)
- Distance-based commute time calculation (in a real application, this would use a transit/routing API)

## Future Enhancements

- Integration with real apartment listing data (e.g., StreetEasy, Zillow)
- Use of a real transit API (e.g., Google Maps, NYC MTA) for accurate commute times
- User accounts to save favorite apartments
- Additional filtering options (e.g., amenities, neighborhood, building type)
- Detailed neighborhood information (e.g., safety, schools, restaurants)

## Disclaimer

This is a demonstration application. The apartment data is simulated and does not represent real listings. Commute times are rough estimates based on distance and do not account for actual transit routes, traffic conditions, or service disruptions.
# find-cheap-apt
