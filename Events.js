let events = [];
        let registrations = [];
        let editingIndex = -1;
        let currentFilter = 'all';
        let currentSort = 'date-asc';

        /* ── Helpers ── */
        function generateEventId() {
            return `EVT-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        }
        function formatTime(t) {
            const [h, m] = t.split(':');
            const hr = parseInt(h);
            return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
        }
        function formatDate(d) {
            return new Date(d).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        }

        /* ── Nav ── */
        function toggleMenu() { document.getElementById('navMenu').classList.toggle('active'); }
        function toggleProfileDropdown() { document.getElementById('profileDropdown').classList.toggle('show'); }
        document.addEventListener('click', e => {
            const p = document.querySelector('.user-profile');
            if (p && !p.contains(e.target)) document.getElementById('profileDropdown').classList.remove('show');
        });

        async function loadUserData() {
            Auth.requireLogin();
            Auth.populateNav();
            Auth.buildInfoDropdown();
            await Auth.loadClubRoles();
            // Show Club Only checkbox if teacher handles a club
            if (Auth.isTeacher() && Auth._teacherClubs && Auth._teacherClubs.length > 0) {
                const grp = document.getElementById('clubOnlyGroup');
                if (grp) grp.style.display = 'block';
                const clubId = Auth._teacherClubs[0];
                const names = { rgs:'Responsible Gamers Society', sports:'Sports Club', multimedia:'Multimedia Club' };
                document.getElementById('eventClubId').value = clubId;
            }
        }

        async function loadRegistrations() {
            try {
                const rows = await DB.getAllRegistrations();
                registrations = rows.map(r => DB.rowToRegistration(r));
            } catch(e) { registrations = []; }
        }

        async function loadEvents() {
            try {
                const allRows = Auth.isStudent()
                    ? await DB.getApprovedEvents()
                    : await DB.getAllEvents();
                const allEvs = allRows.map(r => DB.rowToEvent(r));

                if (Auth.isStudent()) {
                    // Load student's club memberships
                    const user = Auth.getUser();
                    let memberClubs = [];
                    try {
                        const clubRegs = await DB.getClubRegistrationsByStudent(user.idNumber);
                        memberClubs = clubRegs.map(r => r.club_id);
                    } catch(e) {}
                    // Filter: show non-club-only events + club-only events where student is a member
                    events = allEvs.filter(ev => !ev.clubOnly || memberClubs.includes(ev.clubId));
                } else {
                    events = allEvs;
                }
            } catch(e) { events = []; }
            await loadRegistrations();
            renderEvents();
        }

        function saveToStorage() { /* no-op: DB writes happen per operation */ }

        /* ── Filter ── */
        function sortEvents(value) {
            currentSort = value;
            renderEvents();
        }

        function filterEvents(type) {
            currentFilter = type;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            // Find and activate the correct filter button by matching text
            document.querySelectorAll('.filter-btn').forEach(b => {
                const txt = b.textContent.trim().toLowerCase();
                if (type === 'all' && txt.includes('all')) b.classList.add('active');
                else if (type !== 'all' && txt.includes(type)) b.classList.add('active');
            });
            renderEvents();
        }

        /* ── Parse date+time safely in LOCAL timezone ── */
        function parseLocalDateTime(dateStr, timeStr) {
            const [y,mo,d] = dateStr.split('-').map(Number);
            const [h,mi] = timeStr.split(':').map(Number);
            return new Date(y, mo-1, d, h, mi, 0, 0);
        }

        /* ── Check event lifecycle notifications (attendance open / ended) ── */
        function checkEventNotifications() {
            const now = new Date();
            events.forEach(ev => {
                if (ev.approvalStatus !== 'approved') return;
                const evStart = parseLocalDateTime(ev.startDate, ev.startTime);
                const evEnd   = parseLocalDateTime(ev.endDate,   ev.endTime);
                if (now >= evStart && now <= evEnd) Notifications.onAttendanceOpen(ev);
                if (now > evEnd) Notifications.onEventEnded(ev);
            });
        }

        /* ── Render Cards ── */
        function renderEvents() {
            const container = document.getElementById('eventsContainer');
            if (!container) return;

            // Students only see approved events; teachers see all their own events (any status)
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            let allFiltered = currentFilter === 'all' ? events : events.filter(e => e.type === currentFilter);

            let filtered;
            if (Auth.isStudent()) {
                // Students only see approved events
                filtered = allFiltered.filter(e => e.approvalStatus === 'approved');
            } else if (Auth.isTeacher()) {
                // Teachers see all events (including their pending ones)
                filtered = allFiltered;
            } else {
                filtered = allFiltered;
            }

            if (filtered.length === 0) {
                const msg = currentFilter === 'all' ? 'No Events Yet' : `No ${currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)} Events`;
                container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>${msg}</h3><p>${Auth.isTeacher() ? 'Click &ldquo;Add New Event&rdquo; to get started' : 'No events available yet.'}</p></div>`;
                return;
            }

            // Dynamic sort
            filtered = [...filtered].sort((a, b) => {
                if (currentSort === 'date-asc')  return new Date(a.startDate+' '+a.startTime) - new Date(b.startDate+' '+b.startTime);
                if (currentSort === 'date-desc') return new Date(b.startDate+' '+b.startTime) - new Date(a.startDate+' '+a.startTime);
                if (currentSort === 'name-asc')  return a.name.localeCompare(b.name);
                if (currentSort === 'name-desc') return b.name.localeCompare(a.name);
                if (currentSort === 'status') {
                    const order = { ongoing:0, upcoming:1, completed:2 };
                    const getStatus = ev => {
                        const now = new Date();
                        const [sy,sm,sd] = ev.startDate.split('-').map(Number);
                        const [sh,smi]   = (ev.startTime||'00:00').split(':').map(Number);
                        const [ey,em,ed] = ev.endDate.split('-').map(Number);
                        const [eh,emi]   = (ev.endTime||'23:59').split(':').map(Number);
                        const start = new Date(sy,sm-1,sd,sh,smi);
                        const end   = new Date(ey,em-1,ed,eh,emi);
                        if (now < start) return 'upcoming';
                        if (now > end)   return 'completed';
                        return 'ongoing';
                    };
                    return (order[getStatus(a)]??3) - (order[getStatus(b)]??3);
                }
                return 0;
            });
            // Keep select in sync
            const sel = document.getElementById('sortSelect');
            if (sel && sel.value !== currentSort) sel.value = currentSort;

            let html = '<div class="events-grid">';
            filtered.forEach(ev => {
                const idx = events.findIndex(e => e.id === ev.id);
                const regCount = registrations.filter(r => r.eventId === ev.id).length;
                const isCultural = ev.type === 'cultural';

                const approvalStatus = ev.approvalStatus || 'pending';
                const approvalBadge = Auth.isTeacher() ? (
                    approvalStatus === 'pending'  ? `<div class="approval-badge pending"><i class="fas fa-hourglass-half"></i> Waiting for Approval</div>` :
                    approvalStatus === 'approved' ? `<div class="approval-badge approved"><i class="fas fa-check-circle"></i> Approved</div>` :
                    `<div class="approval-badge denied"><i class="fas fa-times-circle"></i> Denied${ev.denyReason ? ': ' + ev.denyReason : ''}</div>`
                ) : '';

                const CLUB_NAMES = { rgs:'Responsible Gamers Society', sports:'Sports Club', multimedia:'Multimedia Club' };
                const clubOnlyBadge = ev.clubOnly
                    ? `<div class="club-only-banner">
                           <i class="fas fa-lock"></i>
                           <span>Club Only — ${CLUB_NAMES[ev.clubId] || ev.clubId}</span>
                       </div>`
                    : '';

                html += `
                    <div class="event-card${ev.clubOnly ? ' club-only-card' : ''}" onclick="openDashboard('${ev.id}')">
                        <div class="event-header${isCultural ? ' cultural' : ''}${ev.clubOnly ? ' club-only-header' : ''}">
                            <div class="click-hint"><i class="fas fa-chart-bar"></i> View Dashboard</div>
                            <div class="event-type-badge">${isCultural ? 'Cultural' : 'Academic'}</div>
                            ${clubOnlyBadge}
                            <div class="event-id">Event ID: ${ev.id}</div>
                            <h3 class="event-name">${ev.name}</h3>
                            ${approvalBadge}
                        </div>
                        <div class="event-body">
                            <div class="event-detail">
                                <div class="event-icon"><i class="fas fa-calendar-alt"></i></div>
                                <div class="event-info"><div class="event-label">Start Date</div><div class="event-value">${formatDate(ev.startDate)}</div></div>
                            </div>
                            <div class="event-detail">
                                <div class="event-icon"><i class="fas fa-calendar-check"></i></div>
                                <div class="event-info"><div class="event-label">End Date</div><div class="event-value">${formatDate(ev.endDate)}</div></div>
                            </div>
                            <div class="event-detail">
                                <div class="event-icon"><i class="fas fa-clock"></i></div>
                                <div class="event-info"><div class="event-label">Time</div><div class="event-value">${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</div></div>
                            </div>
                            <div class="event-detail">
                                <div class="event-icon"><i class="fas fa-map-marker-alt"></i></div>
                                <div class="event-info"><div class="event-label">Venue</div><div class="event-value">${ev.venue}</div></div>
                            </div>
                        </div>
                        <div class="reg-pill${isCultural ? ' cultural' : ''}">
                            <div class="reg-pill-left${isCultural ? ' cultural' : ''}">
                                <i class="fas fa-users"></i>
                                <span class="reg-pill-count">${regCount}</span>
                                <span>${regCount === 1 ? 'Registrant' : 'Registrants'}</span>
                            </div>
                            <span class="reg-pill-hint"><i class="fas fa-mouse-pointer"></i> Click to view</span>
                        </div>
                        <div class="event-actions" onclick="event.stopPropagation()">
                            ${(function(){
                                const cu = JSON.parse(localStorage.getItem('currentUser') || 'null');
                                const isOwner = cu && cu.role === 'teacher' && ev.createdBy === cu.idNumber;
                                return isOwner
                                    ? `<button class="action-btn btn-edit" onclick="editEvent(${idx})"><i class="fas fa-edit"></i> Edit</button>`
                                    : '';
                            })()}
                            ${Auth.isStudent() ? `<div class="student-btn-group" id="student-btns-${ev.id}"><i class="fas fa-spinner fa-spin" style="color:#aaa;font-size:12px;"></i></div>` : ""}
                            ${(function(){
                                const cu2 = JSON.parse(localStorage.getItem('currentUser') || 'null');
                                const isOwner2 = cu2 && cu2.role === 'teacher' && ev.createdBy === cu2.idNumber;
                                return isOwner2
                                    ? '<button class="action-btn btn-delete" onclick="deleteEvent(' + idx + ')"><i class="fas fa-trash"></i> Delete</button>'
                                    : '';
                            })()}
                        </div>
                    </div>`;
            });
            html += '</div>';
            container.innerHTML = html;
            Auth.applyEventRoles(); // re-apply role hiding after every render
            fillStudentButtons(); // async fill attendance/register buttons
        }

        /* ══════════════════════════════
           REGISTRATION DASHBOARD
           ══════════════════════════════ */
        async function openDashboard(eventId) {
            const ev = events.find(e => e.id === eventId);
            if (!ev) return;

            const regs = registrations.filter(r => r.eventId === eventId);
            const isCultural = ev.type === 'cultural';
            const cc = isCultural ? 'c' : '';
            const culturalClass = isCultural ? 'cultural' : '';

            // Counts
            const total = regs.length;
            const programs = ['BSIT', 'BSCS', 'BSCpE', 'ACT-MM', 'ACT-AD'];
            const progCounts = {};
            programs.forEach(p => progCounts[p] = regs.filter(r => r.program === p).length);
            const years = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
            const yearCounts = {};
            years.forEach(y => yearCounts[y] = regs.filter(r => r.yearLevel === y).length);
            const maxY = Math.max(...Object.values(yearCounts), 1);

            // Build HTML
            const progChips = programs.map(p => `
                    <div class="prog-chip${isCultural ? ' cultural-chip' : ''}">
                        <div class="pnum">${progCounts[p]}</div>
                        <div class="pname">${p}</div>
                    </div>`).join('');

            const yearBars = years.map(y => {
                const pct = Math.round(yearCounts[y] / maxY * 100);
                return `<div class="yr-row">
                        <div class="yr-lbl">${y}</div>
                        <div class="yr-bg">
                            <div class="yr-fill${isCultural ? ' c' : ''}" style="width:${pct}%">
                                ${yearCounts[y] > 0 ? `<span>${yearCounts[y]}</span>` : ''}
                            </div>
                        </div>
                        <div class="yr-num">${yearCounts[y]}</div>
                    </div>`;
            }).join('');

            const evDays = getEventDays(ev);
            let tableBody = '';
            if (regs.length === 0) {
                tableBody = `<tr class="no-data"><td colspan="6" style="text-align:center;padding:40px;color:#bbb;">
                        <i class="fas fa-users-slash" style="font-size:30px;display:block;margin-bottom:10px;"></i>
                        No registrants yet for this event
                    </td></tr>`;
            } else {
                for (let i = 0; i < regs.length; i++) {
                    const r = regs[i];
                    const date = new Date(r.registeredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const attRow = await DB.getAttendance(ev.id, r.studentId);
                    let presentBadge;
                    if (!attRow) {
                        presentBadge = '<span class="absent-badge"><i class="fas fa-clock"></i> Pending</span>';
                    } else if (attRow.condition === 'late') {
                        presentBadge = '<span style="background:#fff3e0;color:#e65100;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;"><i class="fas fa-clock"></i> Late</span>';
                    } else if (attRow.condition === 'absent_auto') {
                        presentBadge = '<span class="absent-badge"><i class="fas fa-times-circle"></i> Absent</span>';
                    } else {
                        presentBadge = '<span class="present-badge"><i class="fas fa-check-circle"></i> Present</span>';
                    }
                    // Teacher can click row to see student details; student cannot
                    const rowClick = Auth.isTeacher() ? `onclick="viewStudentDetail('${r.registrationId}','${ev.id}')" style="cursor:pointer;"` : '';
                    const teacherHint = Auth.isTeacher() ? '<span style="font-size:10px;color:#aaa;margin-left:4px;">&#128065;</span>' : '';
                    tableBody += `<tr class="dash-row" ${rowClick}>
                            <td>${i + 1}</td>
                            <td><strong>${r.firstName} ${r.lastName}</strong>${teacherHint}</td>
                            <td>${r.studentId}</td>
                            <td>${r.program}</td>
                            <td>${r.yearLevel}</td>
                            <td>${date}</td>
                            <td>${presentBadge}</td>
                        </tr>`;
                }
            }

            document.getElementById('dashBox').innerHTML = `
                    <div class="dash-top ${culturalClass}">
                        <div class="dash-top-info">
                            <h3><i class="fas fa-chart-bar" style="margin-right:10px;opacity:0.8;"></i>${ev.name}</h3>
                            <div class="meta">
                                <span><i class="fas fa-calendar-alt"></i> ${formatDate(ev.startDate)}</span>
                                <span><i class="fas fa-clock"></i> ${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}</span>
                                <span><i class="fas fa-map-marker-alt"></i> ${ev.venue}</span>
                            </div>
                        </div>
                        <button class="dash-x" onclick="closeDashboard()"><i class="fas fa-times"></i></button>
                    </div>


                        <div class="table-toolbar">
                            <div class="sec-title ${culturalClass}" style="margin-bottom:0;">
                                <i class="fas fa-table"></i> Registrants List
                                <span style="font-size:12px;font-weight:400;color:#888;margin-left:6px;">(${total} total)</span>
                            </div>
                            <input class="dash-search" type="text" placeholder="Search name, ID, program..." oninput="dashSearch(this.value)">
                        </div>
                        ${evDays.length > 1 ? `
                        <div style="padding:12px 20px 0;">
                            <div style="font-size:12px;font-weight:600;color:#888;margin-bottom:8px;"><i class="fas fa-calendar-week"></i> Event Days — click a day to view its attendance</div>
                            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                                ${evDays.map((day,di) => {
                                    const dayLabel = new Date(day+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
                                    const isToday = day === getTodayStr();
                                    return '<button onclick=\'viewDayAttendance(\"'+ev.id+'\",\"'+day+'\")\'  style=\'padding:6px 14px;border-radius:20px;border:2px solid '+(isToday?'#2c5282':'#ddd')+';background:'+(isToday?'#2c5282':'#fff')+';color:'+(isToday?'#fff':'#555')+';font-size:12px;font-weight:600;cursor:pointer;\'>'+dayLabel+(isToday?' (Today)':'')+'</button>';
                                }).join('')}
                            </div>
                        </div>` : ''}
                        <div class="table-wrap" style="margin-top:12px;">
                            <table class="r-table">
                                <thead>
                                    <tr>
                                        <th>#</th><th>Name</th><th>Student ID</th>
                                        <th>Program</th><th>Year Level</th><th>Date Registered</th><th>Attendance</th>
                                    </tr>
                                </thead>
                                <tbody id="dashTBody">${tableBody}</tbody>
                            </table>
                        </div>
                    </div>

                   
                `;

            document.getElementById('dashOverlay').classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        function closeDashboard() {
            document.getElementById('dashOverlay').classList.remove('open');
            document.body.style.overflow = '';
        }

        /* ── View attendance for a specific day (multi-day events) ── */
        async function viewDayAttendance(eventId, day) {
            const ev = events.find(e => e.id === eventId);
            if (!ev) return;
            const allAtt = await DB.getAttendanceByEvent(eventId);
            const dayAtt = allAtt.filter(a => a.remarks && a.remarks.includes('[Day:' + day + ']'));
            const regs   = await DB.getRegistrationsByEvent(eventId);
            const dayLabel = new Date(day+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

            let rows = '';
            if (dayAtt.length === 0) {
                rows = '<tr><td colspan="5" style="text-align:center;padding:30px;color:#bbb;"><i class="fas fa-clipboard" style="font-size:24px;display:block;margin-bottom:8px;"></i>No attendance recorded for this day yet</td></tr>';
            } else {
                dayAtt.forEach((a,i) => {
                    const condColor = a.condition === 'present' ? '#2e7d32' : a.condition === 'late' ? '#e65100' : '#c62828';
                    const condLabel = a.condition === 'present' ? '✅ Present' : a.condition === 'late' ? '⏰ Late' : '❌ Absent';
                    const cleanRemarks = (a.remarks||'').replace(/\[Day:[^\]]+\]/g,'').trim();
                    rows += `<tr>
                        <td>${i+1}</td>
                        <td><strong>${a.student_name || a.studentName || ''}</strong></td>
                        <td>${a.student_id || a.studentId || ''}</td>
                        <td><span style="color:${condColor};font-weight:700;">${condLabel}</span></td>
                        <td>${cleanRemarks || '—'}</td>
                    </tr>`;
                });
            }

            // Show in a simple alert-style overlay inside dashBox
            const present = dayAtt.filter(a=>a.condition==='present').length;
            const late    = dayAtt.filter(a=>a.condition==='late').length;
            const absent  = dayAtt.filter(a=>a.condition==='absent_auto').length;
            const pending = regs.length - dayAtt.length;

            const existing = document.getElementById('dayAttPanel');
            if (existing) existing.remove();

            const panel = document.createElement('div');
            panel.id = 'dayAttPanel';
            panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:6000;display:flex;align-items:center;justify-content:center;padding:20px;';
            panel.innerHTML = `
                <div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:85vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);">
                    <div style="background:linear-gradient(135deg,#1a365d,#2c5282);color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:16px;font-weight:700;"><i class="fas fa-calendar-day" style="margin-right:8px;"></i>${ev.name}</div>
                            <div style="font-size:12px;opacity:.8;margin-top:4px;">${dayLabel}</div>
                        </div>
                        <button onclick="document.getElementById('dayAttPanel').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;">✕</button>
                    </div>
                    <div style="display:flex;gap:10px;padding:16px 24px;background:#f8faff;border-bottom:1px solid #eee;">
                        <div style="flex:1;text-align:center;background:#e8f5e9;border-radius:10px;padding:10px;"><div style="font-size:22px;font-weight:700;color:#2e7d32;">${present}</div><div style="font-size:11px;color:#555;">Present</div></div>
                        <div style="flex:1;text-align:center;background:#fff3e0;border-radius:10px;padding:10px;"><div style="font-size:22px;font-weight:700;color:#e65100;">${late}</div><div style="font-size:11px;color:#555;">Late</div></div>
                        <div style="flex:1;text-align:center;background:#ffebee;border-radius:10px;padding:10px;"><div style="font-size:22px;font-weight:700;color:#c62828;">${absent}</div><div style="font-size:11px;color:#555;">Absent</div></div>
                        <div style="flex:1;text-align:center;background:#f5f5f5;border-radius:10px;padding:10px;"><div style="font-size:22px;font-weight:700;color:#888;">${pending}</div><div style="font-size:11px;color:#555;">Pending</div></div>
                    </div>
                    <div style="overflow-x:auto;padding:0 16px 16px;">
                        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
                            <thead><tr style="border-bottom:2px solid #eee;">
                                <th style="padding:8px;text-align:left;">#</th>
                                <th style="padding:8px;text-align:left;">Name</th>
                                <th style="padding:8px;text-align:left;">ID</th>
                                <th style="padding:8px;text-align:left;">Status</th>
                                <th style="padding:8px;text-align:left;">Remarks</th>
                            </tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
            document.body.appendChild(panel);
            panel.addEventListener('click', e => { if(e.target===panel) panel.remove(); });
        }

        /* ══ Attendance Form (Student) ══ */
        /* ═══════════════════════════════════════════════════
           ATTENDANCE TIMER — Real-time clock based
           ═══════════════════════════════════════════════════
           Logic:
           - If event has att_duration set (e.g. 20 min):
               • 0 to duration/2 mins elapsed = Present
               • duration/2 to duration mins  = Late
               • beyond duration              = Absent (locked)
           - If NO att_duration (default):
               • Uses real event start time
               • Same split: 0→half=Present, half→full=Late
               • Default window = 20 min (10 present + 10 late)
           - Timer display shows time ELAPSED since event start
           - Reopening form does NOT reset — always reflects real clock
           ═══════════════════════════════════════════════════ */
        let _attTimerInt = null;
        let _attCurrentEventId = null;

        function startAttendanceTimer(ev) {
            clearInterval(_attTimerInt);
            _attCurrentEventId = ev.id;

            // If no attendance duration set — hide timer bar, auto-set present, no locking
            const bar = document.getElementById('attTimerBar');
            if (!ev.attDuration || ev.attDuration <= 0) {
                if (bar) bar.style.display = 'none';
                // Still set condition to present and enable submit
                document.getElementById('attCondition').value = 'present';
                const submitBtn = document.getElementById('attSubmitBtn');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Attendance'; }
                return; // no timer needed
            }

            _attTimerInt = setInterval(() => _updateTimerUI(ev), 1000);
            _updateTimerUI(ev); // immediate first render
        }

        function _updateTimerUI(ev) {
            if (!ev) return;
            const now      = new Date();
            const evStart  = parseLocalDateTime(ev.startDate, ev.startTime);
            const evEnd    = parseLocalDateTime(ev.endDate,   ev.endTime);

            // Duration window in seconds — from event's att_duration
            const durMins  = ev.attDuration;
            const durSecs  = durMins * 60;
            const halfSecs = Math.floor(durSecs / 2);

            const elapsedSecs = Math.floor((now - evStart) / 1000); // seconds since event started
            const remainSecs  = Math.max(0, durSecs - elapsedSecs);

            // Display: show time elapsed since start (real clock)
            const elMins = Math.floor(elapsedSecs / 60);
            const elSecs = elapsedSecs % 60;
            const elDisplay = '+' + String(elMins).padStart(2,'0') + ':' + String(Math.abs(elSecs)).padStart(2,'0');

            const countdown = document.getElementById('attTimerCountdown');
            const prog      = document.getElementById('attTimerProgress');
            const badge     = document.getElementById('attStatusBadge');
            const bar       = document.getElementById('attTimerBar');
            const timerLabel = document.getElementById('attTimerLabel');
            const submitBtn  = document.getElementById('attSubmitBtn');
            const threshLine = document.getElementById('attThreshLine');

            if (bar) bar.style.display = 'block';

            // Update the threshold labels to reflect actual duration
            if (threshLine) {
                const halfMins = Math.floor(halfSecs / 60);
                threshLine.innerHTML =
                    '<span>0:00 — Present</span>' +
                    '<span>' + halfMins + ':00 — Late</span>' +
                    '<span>' + durMins  + ':00 — Absent</span>';
            }

            if (elapsedSecs < 0) {
                // Event hasn't started yet
                const waitSecs = Math.abs(elapsedSecs);
                const wm = Math.floor(waitSecs/60), ws = waitSecs%60;
                if (countdown) countdown.textContent = 'Starts in ' + wm + ':' + String(ws).padStart(2,'0');
                if (prog) { prog.style.width = '100%'; prog.style.background = '#60a5fa'; }
                if (badge) { badge.textContent = '⏳ NOT STARTED'; badge.style.background='rgba(96,165,250,.25)'; badge.style.color='#bfdbfe'; }
                if (timerLabel) timerLabel.innerHTML = '<i class="fas fa-clock"></i> Event not started yet';
                document.getElementById('attCondition').value = 'present';

            } else if (elapsedSecs <= halfSecs) {
                // PRESENT zone
                const pct = (1 - elapsedSecs / durSecs) * 100;
                if (countdown) countdown.textContent = elDisplay;
                if (prog) { prog.style.width = pct + '%'; prog.style.background = '#4ade80'; }
                if (badge) { badge.textContent = '✅ PRESENT'; badge.style.background='rgba(74,222,128,.25)'; badge.style.color='#bbf7d0'; }
                if (timerLabel) timerLabel.innerHTML = '<i class="fas fa-clock"></i> Time since event started';
                if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity='1'; submitBtn.innerHTML='<i class="fas fa-paper-plane"></i> Submit Attendance'; }
                document.getElementById('attCondition').value = 'present';

            } else if (elapsedSecs <= durSecs) {
                // LATE zone
                const pct = (1 - elapsedSecs / durSecs) * 100;
                if (countdown) countdown.textContent = elDisplay;
                if (prog) { prog.style.width = pct + '%'; prog.style.background = '#fb923c'; }
                if (badge) { badge.textContent = '⏰ LATE'; badge.style.background='rgba(251,146,60,.25)'; badge.style.color='#fed7aa'; }
                if (timerLabel) timerLabel.innerHTML = '<i class="fas fa-clock"></i> Time since event started';
                if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity='1'; submitBtn.innerHTML='<i class="fas fa-paper-plane"></i> Submit Attendance'; }
                document.getElementById('attCondition').value = 'late';

            } else {
                // ABSENT — window expired
                if (countdown) countdown.textContent = elDisplay;
                if (prog) { prog.style.width = '0%'; prog.style.background = '#ef4444'; }
                if (badge) { badge.textContent = '❌ ABSENT'; badge.style.background='rgba(239,68,68,.25)'; badge.style.color='#fca5a5'; }
                if (timerLabel) timerLabel.innerHTML = '<i class="fas fa-clock"></i> Attendance window closed';
                if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity='0.5'; submitBtn.innerHTML='<i class="fas fa-ban"></i> Window Closed'; }
                document.getElementById('attCondition').value = 'absent_auto';
                clearInterval(_attTimerInt);
            }
        }

        function openAttendanceForm(eventId) {
            const ev = events.find(e => e.id === eventId);
            if (!ev) return;
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (!currentUser) return;

            document.getElementById('attModalEventName').textContent = ev.name;

            // Show duration info in subtitle only if set
            const durLabel = (ev.attDuration && ev.attDuration > 0)
                ? ' · Window: ' + ev.attDuration + ' min (' + Math.floor(ev.attDuration/2) + ' Present + ' + Math.ceil(ev.attDuration/2) + ' Late)'
                : '';
            document.getElementById('attModalEventDate').textContent =
                formatDate(ev.startDate) + ' · ' + formatTime(ev.startTime) + ' – ' + formatTime(ev.endTime) + durLabel;

            document.getElementById('attStudentName').value = currentUser.name || '';
            document.getElementById('attStudentId').value = currentUser.idNumber || '';
            document.getElementById('attTimestamp').value = new Date().toLocaleString();
            document.getElementById('attYearLevel').value = '';
            document.getElementById('attProgram').value = '';
            document.getElementById('attCondition').value = 'present';
            document.getElementById('attModal').dataset.eventId = eventId;
            document.getElementById('attModal').dataset.sessionDay = getTodayStr();
            document.getElementById('attModal').style.display = 'flex';
            // NOTE: do NOT reset submit btn here — timer will set it correctly
            startAttendanceTimer(ev);
        }

        function closeAttendanceModal() {
            clearInterval(_attTimerInt);
            document.getElementById('attModal').style.display = 'none';
        }

        function getTodayStr() {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
        }

        /* ── Get all days of a multi-day event ── */
        function getEventDays(ev) {
            const days = [];
            const start = new Date(ev.startDate + 'T00:00:00');
            const end   = new Date(ev.endDate   + 'T00:00:00');
            for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
                const yyyy = d.getFullYear();
                const mm   = String(d.getMonth()+1).padStart(2,'0');
                const dd   = String(d.getDate()).padStart(2,'0');
                days.push(`${yyyy}-${mm}-${dd}`);
            }
            return days;
        }

        /* ── Async-fill student action buttons after card render ── */
        async function fillStudentButtons() {
            if (!Auth.isStudent()) return;
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (!currentUser) return;
            const now = new Date();
            for (const ev of events) {
                const span = document.getElementById('student-btns-' + ev.id);
                if (!span) continue;
                const end     = parseLocalDateTime(ev.endDate,   ev.endTime);
                const isCompleted = now > end;
                if (isCompleted) {
                    span.innerHTML = '<button class="action-btn btn-ended student-only" disabled><i class="fas fa-ban"></i> Event Ended</button>';
                    continue;
                }
                const alreadyRegistered = registrations.some(r => r.eventId === ev.id && r.studentId === currentUser.idNumber);
                if (alreadyRegistered) {
                    const evStart = parseLocalDateTime(ev.startDate, ev.startTime);
                    const attendanceOpen = now >= evStart && now <= end;
                    let alreadyAttended = false;
                    try {
                        const attRow = await DB.getAttendance(ev.id, currentUser.idNumber);
                        if (attRow) {
                            const evDays = getEventDays(ev);
                            if (evDays.length <= 1) {
                                // Single day event: attended = done
                                alreadyAttended = true;
                            } else {
                                // Multi-day: check if today's session already attended
                                const todayKey = '[Day:' + getTodayStr() + ']';
                                const allDayAtts = await DB.getAttendanceByEvent(ev.id);
                                alreadyAttended = allDayAtts.some(a =>
                                    a.student_id === currentUser.idNumber &&
                                    a.remarks && a.remarks.includes(todayKey)
                                );
                            }
                        }
                    } catch(e) {}
                    let btns = '<button class="action-btn btn-unregister student-only" onclick="unregisterEvent(\'' + ev.id + '\')"><i class="fas fa-user-minus"></i> Unregister</button>';
                    if (alreadyAttended) {
                        btns += ' <button class="action-btn btn-attended student-only" disabled><i class="fas fa-check-circle"></i> Attended</button>';
                    } else if (attendanceOpen) {
                        btns += ' <button class="action-btn btn-attendance student-only" onclick="openAttendanceForm(\'' + ev.id + '\')"><i class="fas fa-clipboard-check"></i> Attendance</button>';
                    } else {
                        btns += ' <button class="action-btn btn-attendance-locked student-only" disabled title="Available during event time only"><i class="fas fa-lock"></i> Attendance</button>';
                    }
                    span.innerHTML = btns;
                } else {
                    span.innerHTML = '<button class="action-btn btn-register student-only" onclick="openRegistration(\'' + ev.id + '\')"><i class="fas fa-user-plus"></i> Register</button>';
                }
            }
        }

        async function submitAttendance() {
            const eventId    = document.getElementById('attModal').dataset.eventId;
            const sessionDay = document.getElementById('attModal').dataset.sessionDay || getTodayStr();
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (!currentUser) return;
            const yearLevel = document.getElementById('attYearLevel').value;
            const program   = document.getElementById('attProgram').value;
            const condition = document.getElementById('attCondition').value || 'present';
            if (!yearLevel || !program) { alert('Please fill in all required fields.'); return; }

            const record = {
                eventId, studentId: currentUser.idNumber, studentName: currentUser.name,
                yearLevel, program, condition,
                remarks: '[Day:' + sessionDay + ']',
                submittedAt: new Date().toISOString()
            };
            clearInterval(_attTimerInt);
            try {
                const evObj2 = events.find(e => e.id === eventId);
                const evDays2 = evObj2 ? getEventDays(evObj2) : [];
                const isMultiDay = evDays2.length > 1;
                if (isMultiDay) {
                    await DB.insertAttendanceDay({
                        eventId, studentId: currentUser.idNumber,
                        studentName: record.studentName, yearLevel: record.yearLevel,
                        program: record.program, condition: record.condition,
                        remarks: record.remarks, sessionDay
                    });
                } else {
                    await DB.submitAttendance({
                        eventId: eventId, studentId: currentUser.idNumber,
                        studentName: record.studentName, yearLevel: record.yearLevel,
                        program: record.program, condition: record.condition, remarks: record.remarks
                    });
                }
                const evObj = events.find(e => e.id === eventId);
                if (evObj) Notifications.onStudentAttended(record, evObj);
                closeAttendanceModal();
                const condLabel = condition === 'present' ? '✅ Present' : condition === 'late' ? '⏰ Late' : '❌ Absent';
                alert('Attendance submitted! Status: ' + condLabel);
                renderEvents();
            } catch(e) {
                alert('Failed to submit attendance. Please try again.');
                console.error(e);
            }
        }

        /* ══ Student Detail Modal (Teacher) ══ */
        async function viewStudentDetail(registrationId, eventId) {
            if (!Auth.isTeacher()) return;
            const reg = registrations.find(r => r.registrationId === registrationId);
            if (!reg) return;
            const attRow = await DB.getAttendance(eventId, reg.studentId);
            const att = attRow ? DB.rowToAttendance(attRow) : null;

            const attSection = att ? `
                <div class="sd-section att-section">
                    <div class="sd-section-title"><i class="fas fa-clipboard-check"></i> Attendance Record</div>
                    <div class="sd-row"><span>Status</span><span class="present-badge"><i class="fas fa-check-circle"></i> Present</span></div>
                    <div class="sd-row"><span>Year Level</span><span>${att.yearLevel}</span></div>
                    <div class="sd-row"><span>Program</span><span>${att.program}</span></div>
                    <div class="sd-row"><span>Physical Condition</span><span>${att.condition}</span></div>
                    ${att.remarks ? `<div class="sd-row"><span>Remarks</span><span>${att.remarks}</span></div>` : ''}
                    <div class="sd-row"><span>Submitted At</span><span>${new Date(att.submittedAt).toLocaleString()}</span></div>
                </div>` : `
                <div class="sd-section">
                    <div class="sd-section-title"><i class="fas fa-clipboard"></i> Attendance Record</div>
                    <div style="text-align:center;padding:20px;color:#999;"><i class="fas fa-clock" style="font-size:24px;display:block;margin-bottom:8px;"></i>No attendance submitted yet</div>
                </div>`;

            document.getElementById('sdModalBody').innerHTML = `
                <div class="sd-section">
                    <div class="sd-section-title"><i class="fas fa-user"></i> Student Information</div>
                    <div class="sd-row"><span>Full Name</span><strong>${reg.firstName} ${reg.lastName}</strong></div>
                    <div class="sd-row"><span>Student ID</span><span>${reg.studentId}</span></div>
                    <div class="sd-row"><span>Program</span><span>${reg.program}</span></div>
                    <div class="sd-row"><span>Year Level</span><span>${reg.yearLevel}</span></div>
                    <div class="sd-row"><span>Email</span><span>${reg.email}</span></div>
                    <div class="sd-row"><span>Registered At</span><span>${new Date(reg.registeredAt).toLocaleString()}</span></div>
                </div>
                ${attSection}`;

            document.getElementById('sdModal').style.display = 'flex';
        }

        function closeStudentDetail() {
            document.getElementById('sdModal').style.display = 'none';
        }

        function overlayClick(e) {
            if (e.target === document.getElementById('dashOverlay')) closeDashboard();
        }

        function dashSearch(val) {
            const rows = document.querySelectorAll('#dashTBody .dash-row');
            const term = val.toLowerCase();
            rows.forEach(r => { r.style.display = r.textContent.toLowerCase().includes(term) ? '' : 'none'; });
        }

        function exportCSV(eventId) {
            const ev = events.find(e => e.id === eventId);
            const regs = registrations.filter(r => r.eventId === eventId);
            if (!regs.length) { alert('No registrants to export.'); return; }
            let csv = '#,Name,Student ID,Program,Year Level,Email,Date Registered\n';
            regs.forEach((r, i) => {
                csv += `${i + 1},"${r.firstName} ${r.lastName}",${r.studentId},${r.program},${r.yearLevel},${r.email},"${new Date(r.registeredAt).toLocaleString()}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${ev.name.replace(/\s+/g, '_')}_Registrants.csv`;
            a.click();
        }

        function openRegistration(eventId) {
            const sess = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (sess && sess.role === 'student' && !sess.emailVerified) {
                alert('⚠️ Your email is not verified.\n\nYou must verify your email before registering for events.\n\nGo to: My Profile → Verify Email');
                sessionStorage.setItem('openVerify', '1');
                window.location.href = 'Profile.html';
                return;
            }
            window.open('event-registration-fixed.html?eventId=' + eventId, '_blank');
        }

        async function unregisterEvent(eventId) {
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            if (!currentUser) return;
            const ev = events.find(e => e.id === eventId);
            const eventName = ev ? ev.name : eventId;
            if (!confirm('Are you sure you want to unregister from "' + eventName + '"?')) return;
            try {
                await DB.deleteRegistration(eventId, currentUser.idNumber);
                registrations = registrations.filter(r =>
                    !(r.eventId === eventId && r.studentId === currentUser.idNumber)
                );
                renderEvents();
            } catch(err) {
                alert('Failed to unregister. Please try again.');
                console.error(err);
            }
        }

        /* ── Add/Edit Modal ── */
        function selectEventType(type) {
            document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
            const sel = Array.from(document.querySelectorAll('.type-option')).find(o =>
                (type === 'academic' && o.textContent.includes('Academic')) ||
                (type === 'cultural' && o.textContent.includes('Cultural'))
            );
            if (sel) sel.classList.add('selected');
            document.getElementById('eventType').value = type;
        }

        function openAddModal() {
            editingIndex = -1;
            document.getElementById('modalTitle').textContent = 'Add New Event';
            document.getElementById('eventForm').reset();
            document.getElementById('eventId').value = generateEventId();
            document.getElementById('eventType').value = '';
            document.querySelectorAll('.type-option').forEach(o => o.classList.remove('selected'));
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('eventStartDate').min = today;
            document.getElementById('eventEndDate').min = today;
            const chk = document.getElementById('clubOnlyCheck');
            if (chk) chk.checked = false;
            const desc = document.getElementById('eventDescription');
            if (desc) desc.value = '';
            document.getElementById('eventModal').style.display = 'block';
        }

        function editEvent(index) {
            editingIndex = index;
            const ev = events[index];
            document.getElementById('modalTitle').textContent = 'Edit Event';
            document.getElementById('eventId').value = ev.id;
            document.getElementById('eventName').value = ev.name;
            document.getElementById('eventStartDate').value = ev.startDate;
            document.getElementById('eventEndDate').value = ev.endDate;
            document.getElementById('eventStartTime').value = ev.startTime;
            document.getElementById('eventEndTime').value = ev.endTime;
            const attDurEl = document.getElementById('eventAttDuration');
            if (attDurEl) attDurEl.value = ev.attDuration || '';
            document.getElementById('eventVenue').value = ev.venue;
            selectEventType(ev.type);
            const desc = document.getElementById('eventDescription');
            if (desc) desc.value = ev.description || '';
            const chk = document.getElementById('clubOnlyCheck');
            if (chk) chk.checked = !!ev.clubOnly;
            document.getElementById('eventModal').style.display = 'block';
        }

        function validateDates() {
            const s = new Date(document.getElementById('eventStartDate').value);
            const e = new Date(document.getElementById('eventEndDate').value);
            if (e < s) { alert('End date cannot be before start date'); return false; }
            return true;
        }

        document.addEventListener('DOMContentLoaded', () => {
            const s = document.getElementById('eventStartDate');
            const e = document.getElementById('eventEndDate');
            const et = document.getElementById('eventEndTime');
            const st = document.getElementById('eventStartTime');

            if (s && e) s.addEventListener('change', function () {
                e.min = this.value;
                if (e.value && e.value < this.value) e.value = this.value;
            });

            // Live preview for attendance duration
            const attDurInput = document.getElementById('eventAttDuration');
            const attDurPreview = document.getElementById('attDurPreview');
            if (attDurInput && attDurPreview) {
                attDurInput.addEventListener('input', function() {
                    const v = parseInt(this.value);
                    if (v >= 2) {
                        const half = Math.floor(v/2);
                        attDurPreview.textContent = half + ' min Present + ' + (v - half) + ' min Late';
                        attDurPreview.style.display = 'inline-block';
                    } else {
                        attDurPreview.textContent = '';
                        attDurPreview.style.display = 'none';
                    }
                });
            }

            // Auto-advance end date when end time is midnight (00:00 = 12 AM)
            function checkMidnightAdvance() {
                if (!et || !e || !s) return;
                const endTimeVal = et.value;
                const endDateVal = e.value;
                const startDateVal = s.value;
                if (!endTimeVal || !endDateVal || !startDateVal) return;
                if (endTimeVal === '00:00') {
                    // If end date == start date, midnight means next day
                    if (endDateVal === startDateVal) {
                        const nextDay = new Date(endDateVal + 'T00:00:00');
                        nextDay.setDate(nextDay.getDate() + 1);
                        const yyyy = nextDay.getFullYear();
                        const mm = String(nextDay.getMonth()+1).padStart(2,'0');
                        const dd = String(nextDay.getDate()).padStart(2,'0');
                        e.value = `${yyyy}-${mm}-${dd}`;
                    }
                }
            }

            if (et) et.addEventListener('change', checkMidnightAdvance);
            if (st) st.addEventListener('change', checkMidnightAdvance);
        });

        async function saveEvent() {
            const id = document.getElementById('eventId').value.trim();
            const type = document.getElementById('eventType').value;
            const name = document.getElementById('eventName').value.trim();
            const startDate = document.getElementById('eventStartDate').value;
            const endDate = document.getElementById('eventEndDate').value;
            const startTime = document.getElementById('eventStartTime').value;
            const endTime = document.getElementById('eventEndTime').value;
            const venue = document.getElementById('eventVenue').value.trim();
            if (!id || !type || !name || !startDate || !endDate || !startTime || !endTime || !venue) { alert('Please fill in all required fields'); return; }
            if (!validateDates()) return;
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
            const isNew = editingIndex === -1;
            const description = (document.getElementById('eventDescription')?.value || '').trim();
            const clubOnlyCheck = document.getElementById('clubOnlyCheck');
            const clubOnlyVal = clubOnlyCheck ? clubOnlyCheck.checked : false;
            const clubIdVal = document.getElementById('eventClubId')?.value || null;
            const attDurRaw = document.getElementById('eventAttDuration')?.value;
            const attDurationVal = attDurRaw ? parseInt(attDurRaw) : null;
            const ev = {
                id, type, name, startDate, endDate, startTime, endTime, venue,
                description,
                attDuration:    attDurationVal,
                clubOnly:       clubOnlyVal,
                clubId:         clubOnlyVal ? clubIdVal : null,
                approvalStatus: isNew ? 'pending' : (events[editingIndex].approvalStatus || 'pending'),
                createdBy: isNew ? (currentUser ? currentUser.idNumber : null) : events[editingIndex].createdBy
            };
            try {
                if (isNew) {
                    await DB.createEvent(ev);
                } else {
                    await DB.updateEvent(id, ev);
                }
                await loadEvents();
                closeModal();
            } catch(err) {
                const msg = err.message || String(err);
                if (msg.includes('relation') || msg.includes('does not exist')) {
                    alert('Database not set up.\n\nPlease run supabase_setup.sql in your Supabase SQL Editor first.');
                } else if (msg.includes('violates') || msg.includes('foreign key')) {
                    alert('Save failed: You must be logged in as a registered teacher.\n\nDetail: ' + msg);
                } else {
                    alert('Failed to save event:\n' + msg);
                }
                console.error('saveEvent error:', err);
            }
        }

        async function deleteEvent(index) {
            if (confirm('Are you sure you want to delete this event?')) {
                const ev = events[index];
                try {
                    await DB.deleteEvent(ev.id);
                    await Notifications.onEventDeleted(ev, 'teacher');
                    await loadEvents();
                } catch(err) {
                    alert('Failed to delete event. Please try again.');
                    console.error(err);
                }
            }
        }

        function closeModal() {
            document.getElementById('eventModal').style.display = 'none';
            document.getElementById('eventForm').reset();
            editingIndex = -1;
        }

        window.onclick = function (e) {
            if (e.target === document.getElementById('eventModal')) {
                closeModal();
            }
        };

        // Initialize on page load
        window.onload = async function () {
            loadUserData();
            await loadEvents();  // loadEvents now calls loadRegistrations internally
            Auth.applyEventRoles();
            Notifications.initUI();
            checkEventNotifications();
            setInterval(checkEventNotifications, 60000); // check every minute
            setInterval(async () => { await loadEvents(); checkEventNotifications(); }, 30000); // auto-refresh + check notifs

            // Hide Add New Event button for students
            const addBtn = document.querySelector('.page-header .btn-primary');
            if (addBtn && Auth.isStudent()) addBtn.style.display = 'none';
        };