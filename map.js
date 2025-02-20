// Initialize variables
let timeFilter = -1;
let stations = [];
let trips = [];
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

// Initialize map
mapboxgl.accessToken = 'pk.eyJ1IjoicHJzMDA3IiwiYSI6ImNtN2M4aHJsczBseTIyaXE2ZXM3bWk3azMifQ.eM6WCG-6kKinfErp-XLVDA'; // Replace with your token

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.0942, 42.3601], // Boston coordinates
  zoom: 12,
  minZoom: 5,
  maxZoom: 18
});

// Select DOM elements
const svg = d3.select('#map').select('svg');
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

// Create scales
const radiusScale = d3.scaleSqrt()
  .domain([0, 1])
  .range([0, 25]);

const stationFlow = d3.scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);

// Helper functions
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(minutes) {
  if (minutes === -1) return '';
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();
  
  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    let beforeMidnight = tripsByMinute.slice(minMinute);
    let afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  } else {
    return tripsByMinute.slice(minMinute, maxMinute).flat();
  }
}

function updateTimeDisplay() {
  timeFilter = Number(timeSlider.value);
  
  if (timeFilter === -1) {
    selectedTime.textContent = '';
    anyTimeLabel.style.display = 'block';
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = 'none';
  }
  
  updateVisualization();
}

function updateVisualization() {
  // Calculate filtered trips
  const filteredTrips = timeFilter === -1 ? trips : filterByMinute(departuresByMinute, timeFilter);
  
  // Update stations data
  filteredStations = stations.map(station => {
    const stationCopy = { ...station };
    stationCopy.departures = filteredDepartures.get(station.short_name) ?? 0;
    stationCopy.arrivals = filteredArrivals.get(station.short_name) ?? 0;
    stationCopy.totalTraffic = stationCopy.departures + stationCopy.arrivals;
    return stationCopy;
  });

  // Update radius scale
  const maxTraffic = d3.max(filteredStations, d => d.totalTraffic);
  radiusScale.domain([0, maxTraffic]);

  // Update circles
  circles
    .data(filteredStations)
    .attr('r', d => radiusScale(d.totalTraffic))
    .style('--departure-ratio', d => 
      d.totalTraffic === 0 ? 0.5 : stationFlow(d.departures / d.totalTraffic));
}

// Event listeners
timeSlider.addEventListener('input', updateTimeDisplay);

map.on('load', async () => {
  // Load bike lanes
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 2,
      'line-opacity': 0.4
    }
  });

  // Load station data
  const stationsResponse = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
  stations = stationsResponse.data.stations;

  // Load trip data
  const tripsData = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
  trips = tripsData.map(trip => {
    trip.started_at = new Date(trip.started_at);
    trip.ended_at = new Date(trip.ended_at);
    
    const startMinute = minutesSinceMidnight(trip.started_at);
    const endMinute = minutesSinceMidnight(trip.ended_at);
    
    departuresByMinute[startMinute].push(trip);
    arrivalsByMinute[endMinute].push(trip);
    
    return trip;
  });

  // Create circles for stations
  const circles = svg.selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', 5)
    .each(function(d) {
      d3.select(this)
        .append('title')
        .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });

  // Update positions when map moves
  function updatePositions() {
    circles
      .attr('cx', d => {
        const point = map.project(new mapboxgl.LngLat(d.Long, d.Lat));
        return point.x;
      })
      .attr('cy', d => {
        const point = map.project(new mapboxgl.LngLat(d.Long, d.Lat));
        return point.y;
      });
  }

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  
  // Initial updates
  updateTimeDisplay();
  updatePositions();
});