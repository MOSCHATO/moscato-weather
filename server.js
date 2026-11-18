import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.WEATHERLINK_API_KEY;
const API_SECRET = process.env.WEATHERLINK_API_SECRET;
const CONFIGURED_STATION_ID = process.env.WEATHERLINK_STATION_ID;
const CACHE_MS = 30_000;
let cache = { at: 0, payload: null };
let stationId = CONFIGURED_STATION_ID || null;

async function weatherLink(pathname) {
  const url = new URL(`https://api.weatherlink.com/v2${pathname}`);
  url.searchParams.set('api-key', API_KEY);
  const response = await fetch(url, {
    headers: { 'X-Api-Secret': API_SECRET, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`WeatherLink API ${response.status}: ${detail.slice(0, 250)}`);
  }
  return response.json();
}

async function getStationId() {
  if (stationId) return stationId;
  const result = await weatherLink('/stations');
  const stations = result.stations || [];
  if (!stations.length) throw new Error('Δεν βρέθηκε σταθμός στον λογαριασμό WeatherLink.');
  // The account is expected to contain the user's own Vantage Vue station.
  stationId = String(stations[0].station_id);
  return stationId;
}

const firstValue = (records, keys) => {
  for (const record of records) for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
};
const fToC = v => v == null ? null : (v - 32) * 5 / 9;
const mphToKmh = v => v == null ? null : v * 1.609344;
const inHgToHpa = v => v == null ? null : v * 33.8638866667;

app.get('/api/current', async (_req, res) => {
  if (!API_KEY || !API_SECRET) return res.status(503).json({ error: 'WeatherLink credentials are not configured.' });
  if (cache.payload && Date.now() - cache.at < CACHE_MS) return res.json(cache.payload);
  try {
    const id = await getStationId();
    const raw = await weatherLink(`/current/${encodeURIComponent(id)}`);
    const sensors = raw.sensors || [];
    const records = sensors.flatMap(sensor => sensor.data || []);
    const newest = records.reduce((best, row) => !best || (row.ts || 0) > (best.ts || 0) ? row : best, null);
    if (!newest) throw new Error('Ο σταθμός δεν επέστρεψε πρόσφατες μετρήσεις.');

    // Davis Vantage Vue reports temperature and pressure in US customary units.
    const tempF = firstValue(records, ['temp', 'temp_out']);
    const feelsF = firstValue(records, ['thw_index', 'heat_index', 'wind_chill']);
    const pressureInHg = firstValue(records, ['bar_sea_level', 'bar', 'bar_absolute', 'pressure_last']);
    const windMph = firstValue(records, ['wind_speed_last', 'wind_speed_avg_last_2_min', 'wind_speed_avg_last_10_min', 'wind_speed_avg']);
    const gustMph = firstValue(records, ['wind_speed_hi_last_2_min', 'wind_speed_hi_last_10_min', 'wind_speed_hi']);
    const payload = {
      source: 'Davis Vantage Vue · WeatherLink',
      stationId: id,
      observedAt: newest.ts ? new Date(newest.ts * 1000).toISOString() : null,
      receivedAt: new Date((raw.generated_at || Math.floor(Date.now()/1000)) * 1000).toISOString(),
      temperature: fToC(tempF),
      feelsLike: fToC(feelsF),
      humidity: firstValue(records, ['hum', 'hum_out']),
      wind: mphToKmh(windMph),
      gusts: mphToKmh(gustMph),
      pressure: inHgToHpa(pressureInHg),
      rainRate: firstValue(records, ['rain_rate_last_mm', 'rain_rate_hi_mm']),
      rain24h: firstValue(records, ['rainfall_last_24_hr_mm', 'rainfall_daily_mm', 'rainfall_mm']),
      windDirection: firstValue(records, ['wind_dir_last', 'wind_dir_scalar_avg_last_1_min', 'wind_dir_scalar_avg_last_2_min']),
      solarRadiation: firstValue(records, ['solar_rad']),
      generatedAt: raw.generated_at || null
    };
    cache = { at: Date.now(), payload };
    res.set('Cache-Control', 'no-store');
    res.json(payload);
  } catch (error) {
    console.error('WeatherLink current conditions failed:', error.message);
    res.status(502).json({ error: 'Δεν ήταν δυνατή η ανάκτηση μετρήσεων από τον Davis.', detail: error.message });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, weatherLinkConfigured: Boolean(API_KEY && API_SECRET) }));
app.use(express.static(__dirname, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`MOSCHATO WEATHER listening on ${PORT}`));
