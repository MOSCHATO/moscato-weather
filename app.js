const LAT = 37.9536;
const LON = 23.6789;
const API = "https://api.open-meteo.com/v1/gfs";
const hourlyVars = ["temperature_2m","relative_humidity_2m","apparent_temperature","precipitation_probability","precipitation","weather_code","wind_speed_10m","wind_gusts_10m"];
const dailyVars = ["weather_code","temperature_2m_max","temperature_2m_min","precipitation_sum","precipitation_probability_max","wind_speed_10m_max","wind_gusts_10m_max","sunrise","sunset"];
let forecast = null;
let visibleDays = 7;

const $ = id => document.getElementById(id);
const fmt = (v, suffix="", digits=0) => v == null || Number.isNaN(Number(v)) ? "--" : `${Number(v).toFixed(digits)}${suffix}`;
const dateFmt = (s, opts) => new Intl.DateTimeFormat("el-GR", opts).format(new Date(s));
const dayName = (s, i) => i === 0 ? "Σήμερα" : i === 1 ? "Αύριο" : dateFmt(s,{weekday:"long"});
function weatherInfo(code){
  if(code===0)return ["☀️","Αίθριος"];
  if(code===1)return ["🌤️","Κυρίως αίθριος"];
  if(code===2)return ["⛅","Μερική συννεφιά"];
  if(code===3)return ["☁️","Συννεφιά"];
  if([45,48].includes(code))return ["🌫️","Ομίχλη"];
  if([51,53,55,56,57].includes(code))return ["🌦️","Ψιχάλες"];
  if([61,63,65,66,67,80,81,82].includes(code))return ["🌧️","Βροχή"];
  if([71,73,75,77,85,86].includes(code))return ["🌨️","Χιονόπτωση"];
  if([95,96,99].includes(code))return ["⛈️","Καταιγίδα"];
  return ["🌡️","Μεταβλητός καιρός"];
}
function showError(msg){const el=$("errorToast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),4500)}
function buildUrl(){
  const p=new URLSearchParams({
    latitude:LAT,longitude:LON,timezone:"Europe/Athens",forecast_days:"16",
    current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly:hourlyVars.join(","),daily:dailyVars.join(","),
    temperature_unit:"celsius",wind_speed_unit:"kmh",precipitation_unit:"mm"
  });
  return `${API}?${p.toString()}`;
}
async function loadForecast(){
  $("refreshBtn").classList.add("spinning");
  try{
    const res=await fetch(buildUrl(),{cache:"no-store"});
    if(!res.ok)throw new Error(`Η υπηρεσία πρόγνωσης απάντησε με κωδικό ${res.status}`);
    forecast=await res.json();
    if(!forecast.current || !forecast.hourly || !forecast.daily)throw new Error("Η απάντηση της πρόγνωσης δεν περιέχει όλα τα απαραίτητα δεδομένα.");
    render();
    $("updatedAt").textContent=`Τελευταία λήψη: ${dateFmt(new Date(),{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})} · Europe/Athens`;
  }catch(e){
    console.error(e);showError("Δεν ήταν δυνατή η λήψη πρόγνωσης. Δοκίμασε ξανά σε λίγο.");
    $("updatedAt").textContent="Η πρόγνωση δεν είναι προσωρινά διαθέσιμη.";
  }finally{$("refreshBtn").classList.remove("spinning")}
}
function renderCurrent(){
  const c=forecast.current, [icon,desc]=weatherInfo(c.weather_code);
  $("currentIcon").textContent=icon;$("currentTemp").textContent=fmt(c.temperature_2m,"°");
  $("currentDesc").textContent=desc;$("feelsLike").textContent=fmt(c.apparent_temperature,"°");
  $("humidity").textContent=fmt(c.relative_humidity_2m,"%");$("wind").textContent=fmt(c.wind_speed_10m," km/h");
  $("pressure").textContent=fmt(c.pressure_msl," hPa");$("rainNow").textContent=fmt(c.precipitation," mm",1);
  $("gusts").textContent=fmt(c.wind_gusts_10m," km/h");$("clouds").textContent=fmt(c.cloud_cover,"%");
  $("daylight").textContent=c.is_day?"☀️ Ημέρα":"🌙 Νύχτα";
  $("todayMax").textContent=fmt(forecast.daily.temperature_2m_max[0],"°");
}
function renderHourly(){
  const h=forecast.hourly, now=new Date();
  let start=h.time.findIndex(t=>new Date(t)>=new Date(now.getTime()-60*60*1000));if(start<0)start=0;
  $("hourly").innerHTML=h.time.slice(start,start+48).map((t,j)=>{
    const i=start+j,[icon]=weatherInfo(h.weather_code[i]);
    return `<article class="hour-card ${j===0?"now":""}"><div class="hour-time">${j===0?"Τώρα":dateFmt(t,{weekday:"short",hour:"2-digit"})}</div><div class="hour-icon">${icon}</div><div class="hour-temp">${fmt(h.temperature_2m[i],"°")}</div><div class="hour-rain">💧 ${fmt(h.precipitation_probability[i],"%")}</div></article>`;
  }).join("");
}
function renderDaily(){
  const d=forecast.daily;
  $("daily").innerHTML=d.time.slice(0,visibleDays).map((t,i)=>{
    const [icon,desc]=weatherInfo(d.weather_code[i]);
    return `<article class="day-row"><div><div class="day-name">${dayName(t,i)}</div><div class="day-date">${dateFmt(t,{day:"numeric",month:"short"})}</div></div><div class="day-icon">${icon}</div><div class="day-desc">${desc}</div><div class="day-temps">${fmt(d.temperature_2m_max[i],"°")} <span>${fmt(d.temperature_2m_min[i],"°")}</span></div><div class="day-rain">💧 ${fmt(d.precipitation_probability_max[i],"%")}</div></article>`;
  }).join("");
}
function render(){renderCurrent();renderHourly();renderDaily()}
$("refreshBtn").addEventListener("click",loadForecast);
document.querySelectorAll("[data-days]").forEach(b=>b.addEventListener("click",()=>{
  visibleDays=Number(b.dataset.days);document.querySelectorAll("[data-days]").forEach(x=>x.classList.toggle("active",x===b));if(forecast)renderDaily();
}));
if("serviceWorker" in navigator && location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(console.warn));
loadForecast();
