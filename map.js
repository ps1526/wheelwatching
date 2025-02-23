mapboxgl.accessToken = 'pk.eyJ1IjoiYWRpdHlhLWtha2FybGEiLCJhIjoiY202N25qZGd3MDRleDJrbzlxcGIwamo3ZCJ9.C7TWHYxsspQHzoO1GcylZA';
const bikeMap = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

let bikeStations = [];
let stationMarkers;
let bikeTrips = [];
let stationDepartures;
let stationArrivals;
let maxStationTraffic;

let timeFilteredTrips = [];
let timeFilteredArrivals = new Map();
let timeFilteredDepartures = new Map();
let timeFilteredStations = [];
let stationRadiusScale;
let trafficFlowScale = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

function getStationCoordinates(station) {
    const location = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = bikeMap.project(location);
    return { cx: x, cy: y };
}

function updateStationPositions() {
    stationMarkers
        .attr('cx', d => getStationCoordinates(d).cx)
        .attr('cy', d => getStationCoordinates(d).cy);
}

function convertToMinutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTimeWindow() {
    timeFilteredTrips = selectedTimeWindow === -1
        ? bikeTrips
        : bikeTrips.filter((trip) => {
            const tripStartMinutes = convertToMinutesSinceMidnight(trip.started_at);
            const tripEndMinutes = convertToMinutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(tripStartMinutes - selectedTimeWindow) <= 60 ||
                Math.abs(tripEndMinutes - selectedTimeWindow) <= 60
            );
        });

    timeFilteredDepartures = d3.rollup(
        timeFilteredTrips,
        v => v.length,
        d => d.start_station_id
    );

    timeFilteredArrivals = d3.rollup(
        timeFilteredTrips,
        v => v.length,
        d => d.end_station_id
    );

    timeFilteredStations = bikeStations.map(station => {
        const stationData = { ...station };
        let stationId = stationData.short_name;
        stationData.arrivals = timeFilteredArrivals.get(stationId) ?? 0;
        stationData.departures = timeFilteredDepartures.get(stationId) ?? 0;
        stationData.totalTraffic = stationData.departures + stationData.arrivals;
        return stationData;
    });

    const mapSvg = d3.select('#map').select('svg');

    stationRadiusScale = d3.scaleSqrt()
            .domain([0, d3.max(bikeStations, d => d.totalTraffic)])
            .range(selectedTimeWindow === -1 ? [0, 25] : [3, 50]);

    stationMarkers = mapSvg.selectAll('circle')
        .data(timeFilteredStations)
        .attr('r', d => stationRadiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .each(function (d) {
            d3.select(this).html(`<title>${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)</title>`)
        })
        .style("--departure-ratio", d => trafficFlowScale(d.totalTraffic !== 0 ? d.departures / d.totalTraffic : 0.5));

    updateStationPositions()
}

bikeMap.on('load', () => {
    const mapSvg = d3.select('#map').select('svg');
    const stationsDataUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    d3.json(stationsDataUrl).then(jsonData => {
        bikeStations = jsonData.data.stations;
        stationMarkers = mapSvg.selectAll('circle')
            .data(bikeStations)
            .enter()
            .append('circle')
            .attr('r', 5)
            .attr('fill', 'steelblue')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('opacity', 0.8);

        updateStationPositions();
    }).catch(error => {
        console.error('Error loading stations data:', error);
    });
    
    const tripsDataUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
    d3.csv(tripsDataUrl).then(tripData => {
        bikeTrips = tripData;
        for (let trip of bikeTrips) {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
        }

        stationDepartures = d3.rollup(
            bikeTrips,
            v => v.length,
            d => d.start_station_id
        );

        stationArrivals = d3.rollup(
            bikeTrips,
            v => v.length,
            d => d.end_station_id
        );

        bikeStations = bikeStations.map(station => {
            let stationId = station.short_name;
            station.arrivals = stationArrivals.get(stationId) ?? 0;
            station.departures = stationDepartures.get(stationId) ?? 0;
            station.totalTraffic = station.departures + station.arrivals;
            return station;
        });

        maxStationTraffic = d3.max(bikeStations, d => d.totalTraffic)
        stationRadiusScale = d3.scaleSqrt()
            .domain([0, d3.max(bikeStations, d => d.totalTraffic)])
            .range([0, 25]);

        stationMarkers
            .attr('r', d => stationRadiusScale(d.totalTraffic))
            .each(function (d) {
                d3.select(this).html(`<title>${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)</title>`)
            })
            .style("--departure-ratio", d => trafficFlowScale(d.departures / d.totalTraffic))
    });

    bikeMap.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    bikeMap.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.7
        }
    });

    bikeMap.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    bikeMap.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': 'green',
            'line-width': 3,
            'line-opacity': 0.7
        }
    });
});

bikeMap.on('move', updateStationPositions);
bikeMap.on('zoom', updateStationPositions);
bikeMap.on('resize', updateStationPositions);
bikeMap.on('moveend', updateStationPositions);

let selectedTimeWindow = -1;
const timeSlider = document.getElementById('time-slider');
const timeDisplay = document.getElementById('selected-time');
const allTimesLabel = document.getElementById('any-time');

function formatTimeDisplay(minutes) {
    const timeDate = new Date(0, 0, 0, 0, minutes);
    return timeDate.toLocaleString('en-US', { timeStyle: 'short' });
}

function updateTimeWindowDisplay() {
    selectedTimeWindow = Number(timeSlider.value);

    if (selectedTimeWindow === -1) {
        timeDisplay.textContent = '';
        timeDisplay.style.display = 'none'
        allTimesLabel.style.display = 'block';
    } else {
        timeDisplay.textContent = formatTimeDisplay(selectedTimeWindow);
        timeDisplay.style.display = 'block'
        allTimesLabel.style.display = 'none';
    }

    filterTripsByTimeWindow()
}

timeSlider.addEventListener('input', updateTimeWindowDisplay);
updateTimeWindowDisplay()