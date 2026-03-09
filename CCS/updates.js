let events = [];
let registrations = [];
let currentFilter = 'all';
let currentUser = null;

/* ── Nav ── */
function toggleMenu() { document.getElementById('navMenu').classList.toggle('active'); }
function toggleProfileDropdown() { document.getElementById('profileDropdown').classList.toggle('show'); }
document.addEventListener('click', function (e) {
    const profile = document.querySelector('.user-profile');
    const dropdown = document.getElementById('profileDropdown');
    if (profile && dropdown && !profile.contains(e.target)) dropdown.classList.remove('show');
});

function loadUserData() {
    Auth.requireLogin();
    Auth.populateNav();
    Auth.buildInfoDropdown();
}

/* ── Init ── */
async function init() {
    currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
    await loadData();
    updateStats();
    await renderNotifications();
    renderUpcomingEvents();
    setupFilterTabs();
}

async function loadData() {
    try {
        const isTeacher = currentUser && currentUser.role === 'teacher';
        const evRows = isTeacher ? await DB.getAllEvents() : await DB.getApprovedEvents();
        events = evRows.map(r => DB.rowToEvent(r));
        const regRows = currentUser
            ? (isTeacher
                ? await DB.getAllRegistrations()
                : await DB.getRegistrationsByStudent(currentUser.idNumber))
            : [];
        registrations = regRows.map(r => DB.rowToRegistration(r));
    } catch(e) { events = []; registrations = []; console.error('loadData:', e); }
}

/* ── Stats ── */
function updateStats() {
    const isTeacher = currentUser && currentUser.role === 'teacher';

    const visibleEvents = isTeacher
        ? events.filter(e => e.createdBy === currentUser.idNumber)
        : events.filter(e => e.approvalStatus === 'approved');

    document.getElementById('academicCount').textContent  = visibleEvents.filter(e => e.type === 'academic').length;
    document.getElementById('culturalCount').textContent  = visibleEvents.filter(e => e.type === 'cultural').length;

    const myRegs = isTeacher
        ? registrations.filter(r => { const ev = events.find(e => e.id === r.eventId); return ev && ev.createdBy === currentUser.idNumber; }).length
        : registrations.filter(r => r.studentId === currentUser?.idNumber).length;
    document.getElementById('registrationCount').textContent = myRegs;

    if (isTeacher) {
        const lbl = document.querySelector('#statsGrid .stat-card:last-child .stat-info p');
        if (lbl) lbl.textContent = 'Registrants on My Events';
    }
}

/* ── Notification style map ── */
function getNotifStyle(type) {
    const map = {
        event_new:          { icon: 'fas fa-calendar-plus',   color: '#2c5282', bg: '#ebf4ff', label: 'New Event'        },
        event_approved:     { icon: 'fas fa-check-circle',    color: '#27ae60', bg: '#e9f7ef', label: 'Approved'         },
        event_denied:       { icon: 'fas fa-times-circle',    color: '#c0392b', bg: '#fdecea', label: 'Denied'           },
        event_deleted:      { icon: 'fas fa-trash-alt',       color: '#c0392b', bg: '#fdecea', label: 'Deleted'          },
        attendance_open:    { icon: 'fas fa-clipboard-check', color: '#e67e22', bg: '#fff4e5', label: 'Attendance Open'  },
        event_ended:        { icon: 'fas fa-flag-checkered',  color: '#718096', bg: '#f5f5f5', label: 'Event Ended'      },
        student_registered: { icon: 'fas fa-user-plus',       color: '#2c5282', bg: '#ebf4ff', label: 'New Registrant'   },
        student_attended:   { icon: 'fas fa-user-check',      color: '#27ae60', bg: '#e9f7ef', label: 'Attended'         },
    };
    return map[type] || { icon: 'fas fa-bell', color: '#2c5282', bg: '#ebf4ff', label: 'Update' };
}

function relativeTime(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Just now';
    if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d} day${d !== 1 ? 's' : ''} ago`;
    return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}

/* ── Filter tab → notification type mapping ── */
const filterMap = {
    all:           null,
    events:        ['event_new','event_approved','event_denied','event_deleted','attendance_open','event_ended'],
    registrations: ['student_registered','student_attended'],
    approvals:     ['event_approved','event_denied','event_deleted'],
};

/* ── Render Activity Feed from personal notifications ── */
async function renderNotifications() {
    const body = document.getElementById('updatesBody');
    if (!body || !currentUser) return;

    let notifs = await Notifications.getAll(currentUser.idNumber);

    const types = filterMap[currentFilter];
    if (types) notifs = notifs.filter(n => types.includes(n.type));

    updateFilterTabsForRole();

    if (notifs.length === 0) {
        body.innerHTML = `
            <div class="no-notifs">
                <i class="fas fa-bell-slash"></i>
                <h3>No notifications here</h3>
                <p>${currentFilter === 'all'
                    ? "You'll see updates here when events are created, approved, or students register."
                    : 'No notifications in this category yet.'}</p>
            </div>`;
        return;
    }

    body.innerHTML = notifs.map(n => {
        const s    = getNotifStyle(n.type);
        const time = relativeTime(n.timestamp);
        return `
        <div class="notif-feed-card${n.read ? '' : ' unread'}" onclick="markAndNavigate('${currentUser.idNumber}','${n.id}','${n.link}')">
            <div class="notif-feed-icon" style="background:${s.bg};color:${s.color};">
                <i class="${s.icon}"></i>
            </div>
            <div class="notif-feed-content">
                <div class="notif-feed-top">
                    <span class="notif-feed-title">${n.title}</span>
                    ${!n.read ? '<span class="unread-dot"></span>' : ''}
                    <span class="notif-feed-badge" style="background:${s.bg};color:${s.color};">${s.label}</span>
                </div>
                <div class="notif-feed-msg">${n.message}</div>
                <div class="notif-feed-time"><i class="fas fa-clock"></i> ${time}</div>
            </div>
        </div>`;
    }).join('');
}

async function markAndNavigate(userId, notifId, link) {
    await Notifications.markRead(userId, notifId);
    const here = window.location.pathname.split('/').pop() || 'updates.html';
    if (!link || link === here || link === 'updates.html') {
        await renderNotifications();
    } else {
        window.location.href = link;
    }
}

async function markAllRead() {
    if (!currentUser) return;
    await Notifications.markAllRead(currentUser.idNumber);
    await Notifications._refresh(currentUser);
    await renderNotifications();
}

/* ── Show/hide filter tabs based on role ── */
function updateFilterTabsForRole() {
    const isTeacher = currentUser && currentUser.role === 'teacher';
    const regTab = document.querySelector('[data-filter="registrations"]');
    const appTab = document.querySelector('[data-filter="approvals"]');
    if (regTab) regTab.textContent = isTeacher ? 'Student Activity' : 'My Registrations';
    // Approvals tab only relevant for teachers
    if (appTab) appTab.style.display = isTeacher ? '' : 'none';
}

/* ── Filter tabs ── */
function setupFilterTabs() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', async function () {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            await renderNotifications();
        });
    });
}

/* ── Upcoming Events sidebar ── */
function renderUpcomingEvents() {
    const body = document.getElementById('upcomingBody');
    if (!body) return;
    body.innerHTML = '';

    const today = new Date(); today.setHours(0,0,0,0);
    const isTeacher = currentUser && currentUser.role === 'teacher';

    let upcoming = events.filter(e => {
        const start = new Date(e.startDate); start.setHours(0,0,0,0);
        if (start < today) return false;
        return isTeacher ? e.createdBy === currentUser.idNumber : e.approvalStatus === 'approved';
    }).sort((a,b) => new Date(a.startDate) - new Date(b.startDate)).slice(0,5);

    if (upcoming.length === 0) {
        body.innerHTML = '<p style="text-align:center;color:#999;padding:30px 20px;font-size:13px;">No upcoming events</p>';
        return;
    }

    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    upcoming.forEach(ev => {
        const start = new Date(ev.startDate);
        const approvalBadge = isTeacher
            ? `<span class="upcoming-approval ${ev.approvalStatus||'pending'}">${
                ev.approvalStatus==='approved'?'✅ Approved':ev.approvalStatus==='denied'?'❌ Denied':'⏳ Pending'}</span>`
            : '';
        const el = document.createElement('div');
        el.className = 'upcoming-event';
        el.onclick = () => { window.location.href = 'Events.html'; };
        el.innerHTML = `
            <div class="event-date-box ${ev.type}">
                <div class="event-date-month">${months[start.getMonth()]}</div>
                <div class="event-date-day">${start.getDate()}</div>
            </div>
            <div class="event-info">
                <div class="event-info-title">${ev.name}</div>
                <div class="event-info-details">
                    <div><i class="fas fa-clock"></i> ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</div>
                    <div><i class="fas fa-map-marker-alt"></i> ${ev.venue}</div>
                </div>
                ${approvalBadge}
            </div>`;
        body.appendChild(el);
    });
}

/* ── Helpers ── */
function formatTime(t) {
    const [h,m] = t.split(':'); const hr = parseInt(h);
    return `${hr%12||12}:${m} ${hr>=12?'PM':'AM'}`;
}

/* ── Page Load ── */
document.addEventListener('DOMContentLoaded', function () {
    loadUserData();
    init();
    // Auto-refresh notifications every 20s
    setInterval(async () => { await loadData(); await renderNotifications(); }, 20000);
    try {
        const u = JSON.parse(localStorage.getItem('currentUser') || 'null');
        if (u) {
            Notifications.initUI();
            // Brief delay so bell badge is visible before clearing
            setTimeout(() => {
                Notifications.markAllRead(u.idNumber);
                Notifications._refresh(u);
            }, 800);
        }
    } catch(e) {}
});