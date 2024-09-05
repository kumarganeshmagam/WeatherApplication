
let pinnedAreas=[];
let currentArea="";
let currentLatitude;
let currentLongitude;
let areaList = {};
let filterValue = 'hourly';
let currentName="";
let currentData = '';
let weatherCodeData;
    let baseUrl = "https://api.open-meteo.com/v1/forecast?"
let params = "&current=relative_humidity_2m,is_day,rain,temperature_2m,wind_speed_10m,weather_code&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code"
let daywisedata = "&past_days=15";
class Area {
    // Define methods for Area class
    async create(currentName, currentLatitude, currentLongitude,areaName) {
        // Example method implementation
        return {
            name: currentName,
            latitude: currentLatitude,
            longitude: currentLongitude,
            areaName:areaName
        };
    }
}

async function getWeatherDescription(code) {
    if(!weatherCodeData) {
        const response =  await fetch('weather_codes.json');
        const data = await response.json()
        const weatherCodes = data;
        console.log(weatherCodes);
        weatherCodeData = weatherCodes
        const weatherCode = weatherCodes.weather_codes.find((codeObj) => codeObj.code === code);
        if (weatherCode) {
            console.log(weatherCode.description);
            return weatherCode.description;
        } else {
            return 'Unknown';
        }
    }else{
        const weatherCodes = weatherCodeData;
        const weatherCode = weatherCodes.weather_codes.find((codeObj) => codeObj.code === code);
        if (weatherCode) {
            console.log(weatherCode.description);
            return weatherCode.description;
        } else {
            return 'Unknown';
        }
    }
}

/* On Load Script Executions START */

//onLoad DataLoad
renderOnLoad();

//Event Handler for Search
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

//Event Handler for clicking on suggestions
document.getElementById('suggestions').addEventListener('click', async function(e) {
    console.log(e.target.dataset);
    if (e.target.dataset.lat && e.target.dataset.lon) {
        const lat = e.target.getAttribute('data-lat');
        const lon = e.target.getAttribute('data-lon');

        alert("You clicked on " + e.target.innerHTML);

        currentLatitude = lat;
        currentLongitude = lon;
        let url = baseUrl + "latitude=" + currentLatitude + "&longitude=" + currentLongitude + params;

        try {
            currentData = await getResponse(url);
            currentName = await getName(currentLatitude, currentLongitude);
            console.log(currentName);
            await populateData();
            await refreshDropdown();
            console.log("Loaded Data");
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

//Event Handler to click on pin
document.getElementById('pin').addEventListener('click', async function(){
    alert("Initiating to ping the currentArea");
    await PinOrUnpinDropDown("pin")
});
document.getElementById('unpin').addEventListener('click',async function(){
    await PinOrUnpinDropDown("unpin")
});


const dropdown = document.getElementById('location');
dropdown.addEventListener('change', async function(event){

    const selectedValue = event.target.value;
    const selectedText = event.target.options[event.target.selectedIndex].text;
    console.log('Selected value:', selectedValue);
    console.log('Selected text:', selectedText);
    if(pinnedAreas.includes(selectedValue)){
        currentName = selectedValue;
        let area = areaList[currentName];
        currentArea = area.areaName;
        let url = baseUrl + "latitude=" + area.latitude + "&longitude=" + area.longitude + params;
        currentData = await getResponse(url);
        await populateData();
    }else{
        alert("please select valid pinnned option using " + currentName);
    }
    await refreshDropdown();
});




//Code to event handle click on radio buttons
let radios = document.getElementsByName('option');
// Add click event listener to each radio button
radios.forEach(async function(radio) {
    radio.addEventListener('click', async function(event) {
        if(event.target.value === 'hourly'){
            if(!currentData.hourly) {
                let url = baseUrl + "latitude=" + currentLatitude + "&longitude=" + currentLongitude + params;
                currentData = await getResponse(url);
                // Right side page
                await displayTable();
            }
            alert("Data Updated to hourly");
        }
        else if(event.target.value === 'day-wise'){
            if(!currentData.hourly){
                let url = baseUrl + "latitude=" + currentLatitude + "&longitude=" + currentLongitude + daywisedata;
                currentData = await getResponse(url);
                // Right side page
                await displayTable();
            }
            alert("Data Updated to day-wise");
        }
    });
});
/* On Load Script Executions END */

async function renderOnLoad(){
    console.log("loading..");
    getLocation();
    setTimeout(async()=>{
        let url= baseUrl+"latitude="+currentLatitude+"&longitude="+currentLongitude+params;
        currentData=await getResponse(url);
        currentName =await getName(currentLatitude, currentLongitude);
        console.log(currentName);
        await populateData();
        await refreshDropdown();
        console.log("Loaded Data");
    },1000);
}

async function populateData(){

    //left side page
    let name = currentName;
    let data = currentData;
    let location=document.getElementById('loc')
    location.innerHTML=currentArea;
    // document.append(location);
    let temp=document.getElementById('temperature');
    temp.innerHTML=data.current.temperature_2m+data.current_units.temperature_2m;

    let dateTimeStr = data.current.time+'Z';
    const timeZone = 'Asia/Kolkata';

// Convert the date-time string to the desired time zone
    const dateInTimeZone = new Date(dateTimeStr).toLocaleString("en-US", { timeZone });


    let date= document.getElementById('date');
    date.innerHTML=dateInTimeZone.split(',')[0];

    let zone = document.getElementById('timeZone');
    zone.innerHTML=timeZone;

    let time = document.getElementById('time');
    time.innerHTML=dateInTimeZone.split(',')[1];

    let day = document.getElementById('day');
    day.innerHTML = data.current.is_day=1 ? "Evening" : "Morning";

    let wind = document.getElementById('wind');
    wind.innerHTML = data.current.wind_speed_10m+data.current_units.wind_speed_10m;

    let rain  = document.getElementById('rain');
    rain.innerHTML = data.current.rain + data.current_units.rain;

    let revh = document.getElementById('revh');
    revh.innerHTML = data.current.relative_humidity_2m +data.current_units.relative_humidity_2m;
    console.log(data);

    let weather = document.getElementById('weather');
    let desc = await getWeatherDescription(data.current.weather_code);
    weather.innerHTML = desc;

    // Right side page
   await displayTable();
}

async function displayTable(){
    let data = currentData;
    let day_wise = document.getElementsByClassName('day-wise-info')[0];
    let table;
    if(document.getElementsByClassName('table_wise')[0]){
         table = document.getElementsByClassName('table_wise')[0];
        table.innerHTML = '';
    }else {
         table = document.createElement('table');
    }
    table.border =1;
    table.className='table_wise';
    let header = table.createTHead();
    let headerRow = header.insertRow(0);
    let headers = ['Time', 'Temperature','Wind Speed', 'Humidity', 'Weather'];
    headers.forEach(function(headerText) {
        var th = document.createElement('th');
        th.appendChild(document.createTextNode(headerText));
        headerRow.appendChild(th);
    });
    let timelist = data.hourly.time;
    let templist = data.hourly.relative_humidity_2m;
    let windlist = data.hourly.temperature_2m;
    let humidlist = data.hourly.wind_speed_10m;
    let weatherlist = data.hourly.weather_code;

    for (let i = 0; i < 16; i++) {
        let row = table.insertRow();
        let cell1 = row.insertCell();
        let cell2 = row.insertCell();
        let cell3 = row.insertCell();
        let cell4 = row.insertCell();
        let cell5 = row.insertCell();

        console.log(await getWeatherDescription(weatherlist[i]), i,weatherlist[i]);
        cell1.appendChild(document.createTextNode(await getDateTime(timelist[i]+'Z',filterValue)));
        cell2.appendChild(document.createTextNode(templist[i]+data.hourly_units.relative_humidity_2m));
        cell3.appendChild(document.createTextNode(windlist[i]+data.hourly_units.temperature_2m));
        cell4.appendChild(document.createTextNode(humidlist[i]+data.hourly_units.wind_speed_10m));
        cell5.appendChild(document.createTextNode(await getWeatherDescription(weatherlist[i])));
    }
    day_wise.appendChild(table);
}

async function getDateTime(dateTimeStr,filterValue){
    const timeZone = 'Asia/Kolkata';
// Convert the date-time string to the desired time zone
    let dateInTime = new Date(dateTimeStr).toLocaleString("en-US", { timeZone });
    if(filterValue === 'hourly'){
        return dateInTime.split(',')[1];
    }
    else{
        return dateInTime;
    }
}

async function PinOrUnpinDropDown(operation) {
    //based on pinValue -> pin / unpin,
    console.log(operation);
    if(operation === "pin"){
        let area = new Area();
        let obj=await area.create(currentName, currentLatitude, currentLongitude,currentArea);
        pinnedAreas.push(currentName);
        console.log(pinnedAreas);
        areaList[currentName]=obj;
        console.log(areaList);
    }else if(operation === 'unpin'){
        //remove the currentName and its area object from existing lists
        pinnedAreas = pinnedAreas.filter(area => area !== currentName);
        delete areaList[currentName];
    }
    await refreshDropdown();
}

async function getName(latitude, longitude){
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
        const data = await response.json();

        const address = data.address;
        currentName = address.city || address.town || address.village || 'Not Found';
        console.log(address);
        console.log(data);
        currentArea= currentName+ ",  " + address.state + ", "+ address.country;
        return address.city || address.town || address.village || 'City not found';
    } catch (error) {
        console.error('Error fetching data:', error);
        return 'Error fetching data';
    }

}
async function refreshDropdown(){
// Get the dropdown element
    const dropdown = document.getElementById('location');

    // Clear existing options in the dropdown
    dropdown.innerHTML = '';

    // Add currentArea as an option
    const currentOption = document.createElement('option');
    currentOption.value = currentName;
    currentOption.textContent = currentName;
    dropdown.appendChild(currentOption);
    // Loop through pinned areas
    pinnedAreas.forEach(area => {
        if (area !== currentName) { // Skip if the area is the currentArea
            const option = document.createElement('option');
            option.value = area;
            option.textContent = area;
            dropdown.appendChild(option);
        }
    });
    let pinButton = document.getElementById('pin');
    let unpinButton = document.getElementById('unpin');

    pinButton.style.display = 'block';
    unpinButton.style.display = 'none';

    if (pinnedAreas.includes(currentName)) {
        pinButton.style.display = 'none';
        unpinButton.style.display = 'block';
    }

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


