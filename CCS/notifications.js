/* ============================================================
   notifications.js — ACT-CCS Notification Engine (Supabase)
   ============================================================ */

const Notifications = {

    async push(userId, { type, title, message, link }) {
        try { await DB.createNotification({ userId, type, title, message, link: link || 'updates.html' }); }
        catch(e) { console.warn('Notifications.push:', e); }
    },

    async pushToRole(role, payload) {
        try {
            const users = await DB.getAllUsers();
            await Promise.all(users.filter(u => u.role === role).map(u => this.push(u.id_number, payload)));
        } catch(e) { console.warn('pushToRole:', e); }
    },

    async pushToAllStudents(payload) { await this.pushToRole('student', payload); },
    async pushToTeacher(teacherId, payload) { await this.push(teacherId, payload); },

    async getAll(userId) {
        try { return (await DB.getNotifications(userId)).map(r => DB.rowToNotification(r)); }
        catch(e) { return []; }
    },

    async markRead(userId, notifId) {
        try { await DB.markNotificationRead(notifId); } catch(e) {}
    },

    async markAllRead(userId) {
        try { await DB.markAllNotificationsRead(userId); } catch(e) {}
    },

    async unreadCount(userId) {
        try { return await DB.unreadCount(userId); } catch(e) { return 0; }
    },

    /* ── UI ── */

    /* ═══════════════════════════════════════════
       OFFLINE / ONLINE DETECTION — all pages
       ═══════════════════════════════════════════ */
    initOfflineDetector() {
        if (document.getElementById('_offlineBar')) return; // already injected

        // Inject styles
        const s = document.createElement('style');
        s.textContent = `
        #_offlineBar {
            display: none;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: #c53030;
            color: #fff;
            text-align: center;
            padding: 13px 20px;
            font-size: 13px;
            font-weight: 700;
            z-index: 999999;
            gap: 10px;
            align-items: center;
            justify-content: center;
            box-shadow: 0 -4px 16px rgba(0,0,0,.3);
            letter-spacing: .2px;
            animation: _offSlideUp .35s ease;
        }
        #_offlineBar.show { display: flex; }
        #_onlineToast {
            display: none;
            position: fixed;
            bottom: 24px; left: 50%; transform: translateX(-50%);
            background: #276749;
            color: #fff;
            padding: 12px 24px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 700;
            z-index: 999999;
            gap: 8px;
            align-items: center;
            box-shadow: 0 4px 18px rgba(0,0,0,.25);
            white-space: nowrap;
            animation: _fadeIn .3s ease;
        }
        #_onlineToast.show { display: flex; }
        @keyframes _offSlideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
        @keyframes _fadeIn     { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        `;
        document.head.appendChild(s);

        // Create offline bar
        const bar = document.createElement('div');
        bar.id = '_offlineBar';
        bar.innerHTML = '<i class="fas fa-wifi-slash" style="font-size:16px;"></i><span>No internet connection. Please check your network and try again.</span>';
        document.body.appendChild(bar);

        // Create back-online toast
        const toast = document.createElement('div');
        toast.id = '_onlineToast';
        toast.innerHTML = '<i class="fas fa-wifi"></i><span>Back online!</span>';
        document.body.appendChild(toast);

        const update = () => {
            if (!navigator.onLine) {
                bar.classList.add('show');
                toast.classList.remove('show');
            } else {
                if (bar.classList.contains('show')) {
                    bar.classList.remove('show');
                    toast.classList.add('show');
                    setTimeout(() => toast.classList.remove('show'), 3000);
                }
            }
        };

        window.addEventListener('offline', update);
        window.addEventListener('online',  update);
        update(); // check immediately on load
    },

    initUI() {
        this.initOfflineDetector(); // run on every page regardless of login
        const user = (() => { try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; } })();
        if (!user || user.role === 'admin') return;
        this._injectStyles();
        this._buildToast();
        this._refresh(user);
        setInterval(() => this._refresh(user), 8000);
    },

    _injectStyles() {
        if (document.getElementById('notif-styles')) return;
        const s = document.createElement('style');
        s.id = 'notif-styles';
        s.textContent = `
        @keyframes notif-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
        #navInfoBadge{
            display:inline-flex;align-items:center;justify-content:center;
            background:#e53e3e;color:#fff;font-size:10px;font-weight:800;
            min-width:20px;height:20px;border-radius:50%;padding:0 4px;
            margin-left:6px;vertical-align:middle;
            border:2px solid #020152;
            animation:notif-pulse 2s infinite;
            font-family:'Montserrat',sans-serif;
        }
        .notif-updates-dot{
            display:inline-block;width:8px;height:8px;border-radius:50%;
            background:#e53e3e;margin-left:6px;vertical-align:middle;
            animation:notif-pulse 2s infinite;
        }
        .notif-toast{position:fixed;bottom:24px;left:24px;background:#1a1a2e;color:#fff;border-radius:10px;padding:14px 18px;max-width:300px;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.3);display:flex;align-items:center;gap:12px;cursor:pointer;transform:translateX(-400px);transition:transform .4s cubic-bezier(.22,.61,.36,1);border-left:4px solid #3b82f6}
        .notif-toast.show{transform:translateX(0)}
        .notif-toast-icon{font-size:20px;flex-shrink:0}
        .notif-toast-body strong{display:block;font-size:13px;font-weight:700}
        .notif-toast-body span{font-size:12px;opacity:.8}
        .notif-toast-hint{font-size:10px;opacity:.55;margin-top:2px;display:block}
        `;
        document.head.appendChild(s);
    },



    _buildToast() {
        if (document.getElementById('notifToast')) return;
        const t = document.createElement('div');
        t.className = 'notif-toast'; t.id = 'notifToast';
        t.innerHTML = `<div class="notif-toast-icon" id="notifToastIcon">🔔</div><div class="notif-toast-body"><strong id="notifToastTitle">New Notification</strong><span id="notifToastMsg"></span><span class="notif-toast-hint">Click to view updates →</span></div>`;
        t.addEventListener('click', () => window.location.href = 'updates.html');
        document.body.appendChild(t);
    },







    async _clickNotif(userId, notifId, link) {
        await this.markRead(userId, notifId);
        window.location.href = link;
    },

    _getIconStyle(type) {
        const map = {
            event_new:{icon:'fas fa-calendar-plus',colorClass:'blue'},
            event_approved:{icon:'fas fa-check-circle',colorClass:'green'},
            event_denied:{icon:'fas fa-times-circle',colorClass:'red'},
            event_deleted:{icon:'fas fa-trash-alt',colorClass:'red'},
            attendance_open:{icon:'fas fa-clipboard-check',colorClass:'orange'},
            event_ended:{icon:'fas fa-flag-checkered',colorClass:'grey'},
            student_registered:{icon:'fas fa-user-plus',colorClass:'blue'},
            student_attended:{icon:'fas fa-user-check',colorClass:'green'},
        };
        return map[type] || { icon:'fas fa-bell', colorClass:'blue' };
    },

    _relTime(ts) {
        const diff = Date.now() - new Date(ts).getTime();
        const m = Math.floor(diff/60000);
        if (m < 1) return 'Just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m/60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h/24)}d ago`;
    },

    _lastKnownCount: {},

    async _refresh(user) {
        const count = await this.unreadCount(user.idNumber);

        // ── Badge on "Information" nav item ──
        const infoItem = Array.from(document.querySelectorAll('nav ul li > a'))
            .find(a => a.textContent.trim().startsWith('Information'));
        if (infoItem) {
            let ib = document.getElementById('navInfoBadge');
            if (!ib) {
                ib = document.createElement('span');
                ib.id = 'navInfoBadge';
                infoItem.appendChild(ib);
            }
            ib.textContent = count > 99 ? '99+' : count;
            ib.style.display = count > 0 ? 'inline-flex' : 'none';
        }

        // ── Red dot on "Updates" dropdown item ──
        const updatesLink = Array.from(document.querySelectorAll('nav .dropdown-content a, nav ul a'))
            .find(a => a.textContent.trim() === 'Updates');
        if (updatesLink) {
            let dot = document.getElementById('updatesDot');
            if (!dot) {
                dot = document.createElement('span');
                dot.id = 'updatesDot';
                dot.className = 'notif-updates-dot';
                updatesLink.appendChild(dot);
            }
            dot.style.display = count > 0 ? 'inline-block' : 'none';
        }

        // ── Toast for new notifications ──
        const prev = this._lastKnownCount[user.idNumber] || 0;
        if (count > prev) {
            const notifs = await this.getAll(user.idNumber);
            const latest = notifs.find(n => !n.read);
            if (latest) this._showToast(latest);
        }
        this._lastKnownCount[user.idNumber] = count;

        // Check attendance open / event ended on EVERY page (not just Events.html)
        await this._checkEventLifecycle();
    },

    _checkEventLifecycle_lastRun: 0,

    async _checkEventLifecycle() {
        // Throttle: run at most once every 60 seconds
        const now = Date.now();
        if (now - this._checkEventLifecycle_lastRun < 60000) return;
        this._checkEventLifecycle_lastRun = now;
        try {
            const rows = await DB.getApprovedEvents();
            const nowDate = new Date();
            for (const row of rows) {
                const ev = DB.rowToEvent(row);
                const startTime = ev.startTime || '00:00';
                const endTime   = ev.endTime   || '23:59';
                const [sy,sm,sd] = ev.startDate.split('-').map(Number);
                const [sh,smi]   = startTime.split(':').map(Number);
                const [ey,em,ed] = ev.endDate.split('-').map(Number);
                const [eh,emi]   = endTime.split(':').map(Number);
                const evStart = new Date(sy, sm-1, sd, sh, smi, 0);
                const evEnd   = new Date(ey, em-1, ed, eh, emi, 0);
                if (nowDate >= evStart && nowDate <= evEnd) await this.onAttendanceOpen(ev);
                if (nowDate > evEnd) {
                    await this.onEventEnded(ev);
                    await this.onAutoAbsentRegistered(ev);
                }
            }
        } catch(e) { console.warn('_checkEventLifecycle:', e); }
    },

    _showToast(notif) {
        const toast = document.getElementById('notifToast');
        if (!toast) return;
        const { icon } = this._getIconStyle(notif.type);
        document.getElementById('notifToastIcon').innerHTML = `<i class="${icon}"></i>`;
        document.getElementById('notifToastTitle').textContent = notif.title;
        document.getElementById('notifToastMsg').textContent = notif.message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 5000);
    },

    /* ── Event Triggers ── */
    async onEventApproved(event) {
        if (event.createdBy) await this.pushToTeacher(event.createdBy, { type:'event_approved', title:'✅ Event Approved', message:`"${event.name}" has been approved.`, link:'Events.html' });
        try {
            if (event.club_only || event.clubOnly) {
                // Only notify members of the specific club
                const clubId = event.club_id || event.clubId;
                const allUsers = await DB.getAllUsers();
                const clubMembers = await DB.getAllClubRegistrations();
                const memberIds = clubMembers.filter(r => r.club_id === clubId).map(r => r.student_id);
                await Promise.all(memberIds.map(sid =>
                    this.push(sid, { type:'event_new', title:'New Club Event: ' + event.name, message:'A new event for your club is open!', link:'Events.html' })
                ));
            } else {
                await this.pushToAllStudents({ type:'event_new', title:'New Event: ' + event.name, message:'A new event is now open for registration!', link:'Events.html' });
            }
        } catch(e) { console.warn('onEventApproved notify:', e); }
    },
    async onEventDenied(event) {
        if (event.createdBy) await this.pushToTeacher(event.createdBy, { type:'event_denied', title:'❌ Event Denied', message:`"${event.name}" was not approved.`, link:'updates.html' });
    },
    async onEventDeleted(event, deletedByRole) {
        if (deletedByRole === 'admin' && event.createdBy)
            await this.pushToTeacher(event.createdBy, { type:'event_deleted', title:'🗑️ Event Deleted', message:`"${event.name}" was deleted by Admin.`, link:'updates.html' });
        try {
            const regs = await DB.getRegistrationsByEvent(event.id);
            await Promise.all(regs.map(r => this.push(r.student_id, { type:'event_deleted', title:'Event Cancelled', message:`"${event.name}" has been removed.`, link:'Events.html' })));
        } catch(e) {}
    },
    async onClubAnnouncement(clubId, clubName, announcement, authorName) {
        const payload = {
            type:    'event_new',
            title:   '📢 New Announcement: ' + announcement.title,
            message: authorName + ' posted in ' + clubName + ': ' + announcement.body.slice(0, 80) + (announcement.body.length > 80 ? '…' : ''),
            link:    'Clubs.html'
        };
        try {
            // Notify all club members (excluding the author)
            const clubRegs = await DB.getAllClubRegistrations();
            const memberIds = clubRegs
                .filter(r => r.club_id === clubId && r.student_id !== announcement.authorId)
                .map(r => r.student_id);
            await Promise.all(memberIds.map(sid => this.push(sid, payload)));

            // Also notify the club teacher if the author is NOT the teacher
            const clubTeacherRow = await DB.getClubTeacher(clubId);
            if (clubTeacherRow && clubTeacherRow.teacher_id !== announcement.authorId) {
                await this.push(clubTeacherRow.teacher_id, {
                    ...payload,
                    title: '📢 Officer Announcement: ' + announcement.title,
                    message: authorName + ' (officer) posted in ' + clubName + ': ' + announcement.body.slice(0, 80) + (announcement.body.length > 80 ? '…' : '')
                });
            }
        } catch(e) { console.warn('onClubAnnouncement notify:', e); }
    },

    async onAutoAbsentRegistered(event) {
        // After event ends: mark registered students with no attendance as absent
        const flagKey = 'notif_auto_absent_' + event.id;
        if (localStorage.getItem(flagKey)) return;
        try {
            const regs = await DB.getRegistrationsByEvent(event.id);
            if (regs.length === 0) { localStorage.setItem(flagKey, '1'); return; }
            // Get existing attendance for this event
            const attRows = await DB.getAttendanceByEvent(event.id);
            const attendedIds = new Set(attRows.map(a => a.student_id));
            // For each registered student with no attendance → insert absent
            const absentStudents = regs.filter(r => !attendedIds.has(r.student_id));
            await Promise.all(absentStudents.map(r =>
                DB.submitAttendance({
                    eventId:     event.id,
                    studentId:   r.student_id,
                    studentName: r.full_name,
                    yearLevel:   r.year_level || '',
                    program:     r.program    || '',
                    condition:   'absent_auto',
                    remarks:     '[Auto-Absent: Did not submit attendance]'
                }).catch(() => {}) // ignore if already exists
            ));
            localStorage.setItem(flagKey, '1');
        } catch(e) { console.warn('onAutoAbsentRegistered:', e); }
    },

    async onAttendanceOpen(event) {
        const flagKey = 'notif_att_open_' + event.id;
        if (localStorage.getItem(flagKey)) return;
        try {
            // Get registered students for this event
            const regs = await DB.getRegistrationsByEvent(event.id);

            // Also include club members if it's a club-only event (they may not have registered)
            let recipientIds = regs.map(r => r.student_id);
            if (event.clubOnly || event.club_only) {
                const clubId = event.clubId || event.club_id;
                const clubRegs = await DB.getAllClubRegistrations();
                const clubMemberIds = clubRegs
                    .filter(r => r.club_id === clubId)
                    .map(r => r.student_id);
                // Merge without duplicates
                recipientIds = [...new Set([...recipientIds, ...clubMemberIds])];
            }

            if (recipientIds.length === 0) return; // nobody to notify — don't set flag
            await Promise.all(recipientIds.map(sid =>
                this.push(sid, {
                    type: 'attendance_open',
                    title: '📋 Attendance Now Open',
                    message: `"${event.name}" has started! Submit your attendance now.`,
                    link: 'Events.html'
                })
            ));
            localStorage.setItem(flagKey, '1'); // only set flag after successful send
        } catch(e) { console.warn('onAttendanceOpen:', e); }
    },
    async onEventEnded(event) {
        const flagKey = 'notif_ended_' + event.id;
        if (localStorage.getItem(flagKey)) return;
        try {
            const regs = await DB.getRegistrationsByEvent(event.id);
            await Promise.all(regs.map(r => this.push(r.student_id, { type:'event_ended', title:'Event Ended', message:`"${event.name}" has ended. Thank you!`, link:'Events.html' })));
            localStorage.setItem(flagKey, '1');
        } catch(e) {}
    },
    async onStudentRegistered(registration, event) {
        if (event && event.createdBy)
            await this.pushToTeacher(event.createdBy, { type:'student_registered', title:'New Registrant', message:`${registration.fullName} registered for "${event.name}".`, link:'Events.html' });
    },
    async onStudentAttended(attendance, event) {
        if (event && event.createdBy)
            await this.pushToTeacher(event.createdBy, { type:'student_attended', title:'Attendance Submitted', message:`${attendance.studentName} submitted attendance for "${event.name}".`, link:'Events.html' });
    }
};