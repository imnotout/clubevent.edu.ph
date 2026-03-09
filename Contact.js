/* Contact.js — ACT-CCS Contact Page */

function toggleMenu() {
    document.getElementById('navMenu').classList.toggle('active');
}

function toggleProfileDropdown() {
    document.getElementById('profileDropdown').classList.toggle('show');
}

document.addEventListener('click', function (e) {
    const profile  = document.querySelector('.user-profile');
    const dropdown = document.getElementById('profileDropdown');
    if (profile && dropdown && !profile.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

window.onload = function () {
    Auth.requireLogin();
    Auth.populateNav();
    Auth.buildInfoDropdown();
    Notifications.initUI();
};