const iconButtons = document.querySelectorAll(".icon-button");

window.addEventListener("load", () => {
    iconButtons.forEach((button) => {
        button.classList.add("reveal");
    });
});
