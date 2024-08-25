let pinnedAreas=[];
let currentArea="";
let currentLatitude;
let currentLongitude;
let areaList = {};
let currentName="";
let baseUrl = "https://api.open-meteo.com/v1/forecast?"
let params = "&current=relative_humidity_2m,is_day,rain,temperature_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m"

renderOnLoad();
document.getElementById('search-input').addEventListener('input', async function() {
    const query = this.value;

    if (query.trim() === '') {
        // Clear suggestions if the query is empty
        document.getElementById('suggestions').innerHTML = '';
        return;
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&countrycodes=IN&format=json`);
        const data = await response.json();

        let suggestions = '';
        data.forEach(location => {
            suggestions += `<div data-lat="${location.lat}" data-lon="${location.lon}">
                                ${location.display_name}
                            </div>`;
        });

        const suggestionsDiv = document.getElementById('suggestions');
        suggestionsDiv.innerHTML = suggestions;

        if (suggestions) {
            suggestionsDiv.style.display = 'block'; // Make sure suggestions are visible
        } else {
            suggestionsDiv.style.display = 'none'; // Hide if no suggestions
        }
    } catch (error) {
        console.error('Error fetching suggestions:', error);
    }
});

document.getElementById('suggestions').addEventListener('click', async function(e) {
    if (e.target.dataset.lat && e.target.dataset.lon) {
        const lat = e.target.getAttribute('data-lat');
        const lon = e.target.getAttribute('data-lon');

        alert("You clicked on " + e.target.innerHTML);

        currentLatitude = lat;
        currentLongitude = lon;
        let url = baseUrl + "latitude=" + currentLatitude + "&longitude=" + currentLongitude + params;

        try {
            let data = await getResponse(url);
            let name = await getName(currentLatitude, currentLongitude);

            console.log(name);
            await populateData(data, name);

            console.log(currentLatitude);
        } catch (error) {
            console.error('Error handling click event:', error);
        }

        // Clear the search input
        document.getElementById('search-input').value = '';

        // Close the suggestions overlay
        let suggestionsDiv = document.getElementById('suggestions');
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
    }
});


async function renderOnLoad(){
    console.log("loading..");
    getLocation();
    setTimeout(async()=>{
        let url= baseUrl+"latitude="+currentLatitude+"&longitude="+currentLongitude+params;
        let data=await getResponse(url);
        let name =await getName(currentLatitude, currentLongitude);
        console.log(name);
        await populateData(data,name);
        console.log(currentLatitude);
    },1000);
}

async function populateData(data,name){
    let location=document.getElementById('loc')
    location.innerHTML=name;
    // document.append(location);
    let temp=document.getElementById('temparatere');
    temp.innerHTML=data.current.temperature_2m+data.current_units.temperature_2m;

    let dateTimeStr = data.current.time+'Z';
    const timeZone = 'Asia/Kolkata';

// Convert the date-time string to the desired time zone
    const dateInTimeZone = new Date(dateTimeStr).toLocaleString("en-US", { timeZone });


    let date= document.getElementById('date');
    date.innerHTML=dateInTimeZone.split(',')[0];

    let time = document.getElementById('time');
    time.innerHTML=dateInTimeZone.split(',')[1];

    let day = document.getElementById('day');
    day.innerHTML = data.current.is_day=0 ? "Evening" : "Morning";

    let wind = document.getElementById('wind');
    wind.innerHTML = data.current.wind_speed_10m+data.current_units.wind_speed_10m;

    let rain  = document.getElementById('rain');
    rain.innerHTML = data.current.rain + data.current_units.rain;

    let revh = document.getElementById('revh');
    revh.innerHTML = data.current.relative_humidity_2m +data.current_units.relative_humidity_2m;
    console.log(data);

}

function updateDropdown(operation, val, name) {

    if(operation === "ADD"){
        refreshDropdown();
    }else{
        pinnedAreas.pop(val);
//pop the area(val) from the areaList
    }
}

async function getName(latitude, longitude){
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await response.json();

        const address = data.address;
        return address.city || address.town || address.village || 'City not found';
    } catch (error) {
        console.error('Error fetching data:', error);
        return 'Error fetching data';
    }

}
function refreshDropdown(){

    //add curentArea as an option child
    //loop pinned areas as option childs
    //if the currentarea is in pinned areas skip to add as an optionchild in dropdown

}


function savePinnedArea(){
    let name= document.getElementById('location');
    let obj=new Area(name, currentLatitude, currentLongitude);
    pinnedAreas.push(currentArea);
    areaList[currentArea]=obj;

}




function updateCurrentLocation(value){
    currentArea=value;
    currentName=document.getElementById('location');

}



async function getResponse(url){
    const response = await fetch(url,{method:'GET'});
    const data= await response.json();
    console.log(data);
    return data;
}

async function getLocation(){
    if("geolocation" in navigator){
        navigator.geolocation.watchPosition(
            function(position){
                const lat=position.coords.latitude;
                const lng=position.coords.longitude;
                currentLatitude = lat;
                currentLongitude = lng;
                return lat+'@'+lng;
                // console.log(`Latitude: ${lat}, longitude: ${lng}`);

            }
        )
    }
}


class Area {
    constructor(name, lat, lng){
        this.name= name;
        this.lat= lat;
        this. lng=lng;
    }
}
