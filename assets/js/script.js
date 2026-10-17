(() => {
    const continueButton = document.getElementById('continue-button');

    function goHome() {
        window.location.href = 'home.html';
    }

    if (continueButton) {
        continueButton.addEventListener('click', goHome);
    }
})();
