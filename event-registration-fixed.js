let currentEvent = null;
let registrations = [];

/* ── Load event from URL param ── */
function loadEventData() {
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');

    if (!eventId) {
        alert('No event selected. Redirecting to events page...');
        window.location.href = 'Events.html';
        return;
    }

    DB.getEventById(eventId).then(row => {
        if (row) {
            currentEvent = DB.rowToEvent(row);
            displayEventInfo();
        } else {
            alert('Event not found. Redirecting to events page...');
            window.location.href = 'Events.html';
        }
    }).catch(() => {
        alert('Failed to load event. Please try again.');
        window.location.href = 'Events.html';
    });
}

/* ── Auto-fill Full Name and Student ID from logged-in user ── */
function autoFillFromUser() {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!user) return;

    // Full Name
    const fullNameEl = document.getElementById('fullName');
    if (fullNameEl && user.name) {
        fullNameEl.value = user.name;
        fullNameEl.setAttribute('readonly', true);
        fullNameEl.style.background = '#f0f5ff';
        fullNameEl.style.color = '#2c5282';
        const badge = document.getElementById('fullNameBadge');
        if (badge) badge.style.display = 'inline-flex';
    }

    // Student ID
    const studentIdEl = document.getElementById('studentId');
    if (studentIdEl && user.idNumber) {
        studentIdEl.value = user.idNumber;
        studentIdEl.setAttribute('readonly', true);
        studentIdEl.style.background = '#f0f5ff';
        studentIdEl.style.color = '#2c5282';
        const badge = document.getElementById('studentIdBadge');
        if (badge) badge.style.display = 'inline-flex';
    }

    // Email intentionally NOT auto-filled so user can choose their own
}

/* ── Display event info card ── */
function displayEventInfo() {
    const headerType = document.getElementById('eventHeaderType');
    if (currentEvent.type === 'cultural') headerType.classList.add('cultural');

    document.getElementById('eventTypeBadge').textContent =
        currentEvent.type === 'academic' ? 'ACADEMIC' : 'CULTURAL';
    document.getElementById('eventName').textContent = currentEvent.name;
    document.getElementById('eventId').textContent = `Event ID: ${currentEvent.id}`;

    const startDate = new Date(currentEvent.startDate).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
    const endDate = new Date(currentEvent.endDate).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });

    document.getElementById('eventDetails').innerHTML = `
        <div class="detail-item">
            <div class="detail-icon"><i class="fas fa-calendar-alt"></i></div>
            <div class="detail-content"><h4>Start Date</h4><p>${startDate}</p></div>
        </div>
        <div class="detail-item">
            <div class="detail-icon"><i class="fas fa-calendar-check"></i></div>
            <div class="detail-content"><h4>End Date</h4><p>${endDate}</p></div>
        </div>
        <div class="detail-item">
            <div class="detail-icon"><i class="fas fa-clock"></i></div>
            <div class="detail-content"><h4>Time</h4><p>${formatTime(currentEvent.startTime)} - ${formatTime(currentEvent.endTime)}</p></div>
        </div>
        <div class="detail-item">
            <div class="detail-icon"><i class="fas fa-map-marker-alt"></i></div>
            <div class="detail-content"><h4>Venue</h4><p>${currentEvent.venue}</p></div>
        </div>
    `;
}

function formatTime(time24) {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/* ── Registrations storage ── */
function loadRegistrations() { /* no-op: registration check done per-query */ }
function saveRegistrations() { /* no-op: handled by DB.createRegistration */ }

/* ── Form submission ── */
document.getElementById('regForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const registration = {
        registrationId: 'REG-' + Date.now(),
        eventId:    currentEvent.id,
        eventName:  currentEvent.name,
        eventType:  currentEvent.type,
        fullName:   document.getElementById('fullName').value.trim(),
        // Keep firstName/lastName split for compatibility with dashboard CSV export
        firstName:  document.getElementById('fullName').value.trim().split(' ')[0] || '',
        lastName:   document.getElementById('fullName').value.trim().split(' ').slice(1).join(' ') || '',
        studentId:  document.getElementById('studentId').value.trim(),
        yearLevel:  document.getElementById('yearLevel').value,
        program:    document.getElementById('program').value,
        email:      document.getElementById('email').value.trim(),
        registeredAt: new Date().toISOString()
    };

    // Store as pending — not saved yet until user clicks Submit
    window.pendingRegistration = registration;
    showSuccessMessage(registration);
});

/* ── Success screen ── */
function showSuccessMessage(reg) {
    document.getElementById('confirmationDetails').innerHTML = `
        <h3>Registration Confirmation</h3>
        <div class="detail-row"><span class="detail-label">Registration ID:</span><span class="detail-value">${reg.registrationId}</span></div>
        <div class="detail-row"><span class="detail-label">Full Name:</span><span class="detail-value">${reg.fullName}</span></div>
        <div class="detail-row"><span class="detail-label">Student ID:</span><span class="detail-value">${reg.studentId}</span></div>
        <div class="detail-row"><span class="detail-label">Program:</span><span class="detail-value">${reg.program}</span></div>
        <div class="detail-row"><span class="detail-label">Year Level:</span><span class="detail-value">${reg.yearLevel}</span></div>
        <div class="detail-row"><span class="detail-label">Email:</span><span class="detail-value">${reg.email}</span></div>
        <div class="detail-row"><span class="detail-label">Event:</span><span class="detail-value">${reg.eventName}</span></div>
    `;
    document.getElementById('registrationForm').style.display = 'none';
    document.getElementById('successMessage').classList.add('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Update button labels to Edit / Submit
    const btnGroup = document.querySelector('.button-group');
    if (btnGroup) {
        btnGroup.innerHTML = `
            <button class="btn btn-edit-reg" onclick="editRegistration()">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-submit-final" onclick="submitFinal()">
                <i class="fas fa-paper-plane"></i> Submit
            </button>
        `;
    }
}

/* ── Edit: go back to form with values still filled in ── */
function editRegistration() {
    const reg = window.pendingRegistration;
    if (!reg) return;

    // Restore form values
    const fullNameEl = document.getElementById('fullName');
    fullNameEl.value = reg.fullName;
    // Keep readonly if auto-filled
    document.getElementById('studentId').value = reg.studentId;
    document.getElementById('yearLevel').value = reg.yearLevel;
    document.getElementById('program').value = reg.program;
    document.getElementById('email').value = reg.email;

    document.getElementById('registrationForm').style.display = 'block';
    document.getElementById('successMessage').classList.remove('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Submit Final: actually save and redirect ── */
async function submitFinal() {
    const reg = window.pendingRegistration;
    if (!reg) return;
    reg.registeredAt = new Date().toISOString();

    const btn = document.querySelector('.btn-submit-final');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        await DB.createRegistration(reg);
        // Notify event's creator teacher
        try {
            const evRow = await DB.getEventById(reg.eventId);
            const evObj = evRow ? DB.rowToEvent(evRow) : null;
            if (evObj) await Notifications.onStudentRegistered(reg, evObj);
        } catch(e) {}
        window.pendingRegistration = null;
        const btnGroup = document.querySelector('.button-group');
        if (btnGroup) {
            btnGroup.innerHTML = `<p style="color:#4CAF50;font-weight:700;font-size:16px;"><i class="fas fa-check-circle"></i> Submitted! Redirecting...</p>`;
        }
        setTimeout(() => { window.location.href = 'Events.html'; }, 1500);
    } catch(err) {
        alert('Failed to submit registration. Please try again.');
        console.error(err);
        if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
    }
}

function goBack()       { window.location.href = 'Events.html'; }
function backToEvents() { window.location.href = 'Events.html'; }

/* ── Init ── */
window.onload = function () {
    loadEventData();
    loadRegistrations();
    autoFillFromUser();
};