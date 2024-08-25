 let pinnedAreas=[];
 let currentArea="";
 let currentLatitude;
 let currentLongitude;
 let areaList = {};
let currentName="";

function updateDropdown(operation, val, name) {

if(operation === "ADD"){
refreshDropdown();
}else{
pinnedAreas.pop(val);
//pop the area(val) from the areaList
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
    return data;
 }

 function getLocation(){
    if("geolocation" in navigator){
        navigator.geolocation.watchPosition(
            function(position){
                const lat=position.coords.latitude;
                const lng=position.coords.longitude;
                console.log(`Latitude: ${lat}, longitude: ${lng}`);
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


