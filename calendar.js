let events = [];
let currentDate = new Date();

/* ══ Nav ══ */
function toggleMenu() { document.getElementById('navMenu').classList.toggle('active'); }
function toggleProfileDropdown() { document.getElementById('profileDropdown').classList.toggle('show'); }
document.addEventListener('click', function (e) {
    const profile = document.querySelector('.user-profile');
    const dropdown = document.getElementById('profileDropdown');
    if (profile && dropdown && !profile.contains(e.target)) dropdown.classList.remove('show');
});

/* ══ Auth ══ */
function loadUserData() {
    Auth.requireLogin();
    Auth.populateNav();
    Auth.buildInfoDropdown();
}

/* ══ Init ══ */
async function init() {
    await loadEvents();
    renderCalendar();
    renderEventsList();
}

async function loadEvents() {
    try {
        const rows = Auth.isStudent() ? await DB.getApprovedEvents() : await DB.getAllEvents();
        const allEvs = rows.map(r => DB.rowToEvent(r));

        if (Auth.isStudent()) {
            // Filter out club-only events the student is not a member of
            const user = Auth.getUser();
            let memberClubs = [];
            try {
                const clubRegs = await DB.getClubRegistrationsByStudent(user.idNumber);
                memberClubs = clubRegs.map(r => r.club_id);
            } catch(e) {}
            events = allEvs.filter(ev => !ev.clubOnly || memberClubs.includes(ev.clubId));
        } else {
            events = allEvs;
        }
    } catch(e) { events = []; console.error('calendar loadEvents:', e); }
}

/* ══ Calendar Render ══ */
function renderCalendar() {
    const year  = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];

    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;

    const firstDay       = new Date(year, month, 1).getDay();
    const daysInMonth    = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today          = new Date();

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    // Previous month filler
    for (let i = firstDay - 1; i >= 0; i--) {
        grid.appendChild(createDayElement(daysInPrevMonth - i, true, false, [], null, null));
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday    = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const dayEvents  = getEventsOnDate(year, month, day);
        grid.appendChild(createDayElement(day, false, isToday, dayEvents, year, month));
    }

    // Next month filler
    const remaining = 42 - grid.children.length;
    for (let day = 1; day <= remaining; day++) {
        grid.appendChild(createDayElement(day, true, false, [], null, null));
    }
}

function createDayElement(day, isOtherMonth, isToday, dayEvents, year, month) {
    const el = document.createElement('div');
    el.className = 'calendar-day';
    el.textContent = day;

    if (isOtherMonth) {
        el.classList.add('other-month');
        return el;
    }

    if (isToday) el.classList.add('today');

    if (dayEvents.length > 0) {
        el.classList.add('has-event');

        // Colour based on first event type
        const hasAcademic = dayEvents.some(ev => ev.type === 'academic');
        const hasCultural = dayEvents.some(ev => ev.type === 'cultural');
        if (hasAcademic && hasCultural) el.classList.add('has-both');
        else if (hasCultural)           el.classList.add('has-cultural');
        else                            el.classList.add('has-academic');

        // Dot indicator
        const dot = document.createElement('div');
        dot.className = 'event-dot';
        el.appendChild(dot);

        // Count badge if more than 1 event
        if (dayEvents.length > 1) {
            const badge = document.createElement('span');
            badge.className = 'event-count-badge';
            badge.textContent = dayEvents.length;
            el.appendChild(badge);
        }

        el.title = `${dayEvents.length} event(s) — click to view`;
        el.addEventListener('click', () => openDayModal(year, month, day));
    }

    return el;
}

/* ══ Helpers ══ */
function getEventsOnDate(year, month, day) {
    const check = new Date(year, month, day);
    check.setHours(0, 0, 0, 0);
    return events.filter(ev => {
        const start = new Date(ev.startDate); start.setHours(0, 0, 0, 0);
        const end   = new Date(ev.endDate);   end.setHours(23, 59, 59, 999);
        return check >= start && check <= end;
    });
}

function getEventStatus(ev) {
    const now = new Date();
    // Build exact local datetimes to avoid UTC timezone shift from bare date strings
    const [sy,sm,sd] = ev.startDate.split('-').map(Number);
    const [sh,smin]  = (ev.startTime || '00:00').split(':').map(Number);
    const [ey,em,ed] = ev.endDate.split('-').map(Number);
    const [eh,emin]  = (ev.endTime   || '23:59').split(':').map(Number);
    const start = new Date(sy, sm-1, sd, sh, smin, 0);
    const end   = new Date(ey, em-1, ed, eh, emin, 0);
    if (now < start) return 'upcoming';
    if (now > end)   return 'completed';
    return 'ongoing';
}

function formatDate(str) {
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
    const [h, m] = t.split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
}

/* ══ Month Navigation ══ */
function previousMonth() { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); }
function nextMonth()     { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); }

/* ══ Day Click Modal ══ */
function openDayModal(year, month, day) {
    const monthNames = ['January','February','March','April','May','June',
        'July','August','September','October','November','December'];
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const date      = new Date(year, month, day);
    const dayEvents = getEventsOnDate(year, month, day);

    document.getElementById('dayModalTitle').textContent =
        `${dayNames[date.getDay()]}, ${monthNames[month]} ${day}, ${year}`;
    document.getElementById('dayModalCount').textContent =
        dayEvents.length === 1 ? '1 event scheduled' : `${dayEvents.length} events scheduled`;

    const body = document.getElementById('dayModalBody');

    if (dayEvents.length === 0) {
        body.innerHTML = `
            <div class="day-modal-empty">
                <i class="fas fa-calendar-times"></i>
                <p>No events on this day.</p>
            </div>`;
    } else {
        const CLUB_NAMES_CAL = { rgs:'Responsible Gamers Society', sports:'Sports Club', multimedia:'Multimedia Club' };
        body.innerHTML = dayEvents.map(ev => {
            const status   = getEventStatus(ev);
            const typeIcon = ev.type === 'cultural' ? 'fas fa-palette' : 'fas fa-graduation-cap';
            const clubBadge = (ev.clubOnly || ev.club_only)
                ? `<span class="day-event-club-badge"><i class="fas fa-lock"></i> ${CLUB_NAMES_CAL[ev.clubId||ev.club_id] || 'Club Only'}</span>`
                : '';
            return `
            <div class="day-event-card ${ev.type}${(ev.clubOnly||ev.club_only) ? ' club-only' : ''}">
                <div class="day-event-top">
                    <span class="day-event-type ${ev.type}">
                        <i class="${typeIcon}"></i> ${ev.type.charAt(0).toUpperCase() + ev.type.slice(1)}
                    </span>
                    <span class="day-event-status ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
                </div>
                ${clubBadge}
                <div class="day-event-name">${ev.name}</div>
                <div class="day-event-id">ID: ${ev.id}</div>
                <div class="day-event-details">
                    <span><i class="fas fa-clock"></i> ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${ev.venue}</span>
                    <span><i class="fas fa-calendar-alt"></i> ${formatDate(ev.startDate)} → ${formatDate(ev.endDate)}</span>
                </div>
                <a href="Events.html" class="day-event-link">
                    <i class="fas fa-external-link-alt"></i> View in Events
                </a>
            </div>`;
        }).join('');
    }

    document.getElementById('dayModal').classList.add('active');
}

function closeDayModal() {
    document.getElementById('dayModal').classList.remove('active');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDayModal(); });

/* ══ Events Sidebar ══ */
function renderEventsList() {
    const body = document.getElementById('eventsListBody');
    body.innerHTML = '';

    if (events.length === 0) {
        body.innerHTML = '<p style="text-align:center;color:#999;padding:40px;">No events scheduled</p>';
        return;
    }

    const sorted = [...events].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const shortMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    sorted.forEach(ev => {
        const start  = new Date(ev.startDate);
        const status = getEventStatus(ev);
        const el     = document.createElement('div');
        el.className = `event-item ${ev.type}`;
        el.onclick   = () => { window.location.href = 'Events.html'; };
        el.innerHTML = `
            <div class="event-date-box ${ev.type}">
                <div class="event-date-month">${shortMonths[start.getMonth()]}</div>
                <div class="event-date-day">${start.getDate()}</div>
            </div>
            <div class="event-info">
                <div class="event-info-title">${ev.name}</div>
                <div class="event-info-details">
                    <div><i class="fas fa-clock"></i> ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</div>
                    <div><i class="fas fa-map-marker-alt"></i> ${ev.venue}</div>
                    <div><i class="fas fa-calendar"></i> ${formatDate(ev.startDate)} to ${formatDate(ev.endDate)}</div>
                </div>
                <span class="sidebar-status ${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
            </div>`;
        body.appendChild(el);
    });
}

/* ══ Page Load ══ */
document.addEventListener('DOMContentLoaded', function () {
    loadUserData();
    init();
    Notifications.initUI();
    // Auto-refresh calendar every 30s
    setInterval(async () => { await loadEvents(); renderCalendar(); }, 30000);
});