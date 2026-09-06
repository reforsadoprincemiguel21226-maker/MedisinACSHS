const logo = document.getElementById("logo");
const title = document.getElementById("title");
const start = document.getElementById("start");

const text = "MEDISINACSHS";
let index = 0;

function goHome(){
    window.location.href = "home.html";
}

let hasRedirected = false;

function redirectOnce(){
    if(hasRedirected){
        return;
    }
    hasRedirected = true;
    goHome();
}

// Kiosk mode: any touch/click on the splash page opens the homepage.
document.addEventListener("pointerdown", redirectOnce);
document.addEventListener("click", redirectOnce);
document.addEventListener("touchstart", redirectOnce, { passive: true });

/* STEP 1 - logo slide up */

window.onload = () => {

    logo.classList.add("slideUp");

    /* STEP 2 - move logo left */

    setTimeout(()=>{
        logo.classList.add("moveLeft");
        typeLetters();
    },1200);

};

/* STEP 3 - letters appear */

function typeLetters(){

    if(index < text.length){

        title.innerHTML += text[index];
        index++;

        setTimeout(typeLetters,120);

    }
    else{

        /* STEP 4 - show PRESS START */

        start.style.opacity = "1";

    }
}