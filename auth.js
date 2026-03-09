/* ============================================================
   auth.js  –  Shared authentication & role utility
   Used by every page in the ACT-CCS portal
   ============================================================ */

const Auth = {

    /* ── getters ── */
    getUser() {
        const u = localStorage.getItem('currentUser');
        return u ? JSON.parse(u) : null;
    },
    getRole() {
        const u = this.getUser();
        return u ? u.role : null;          // 'student' | 'teacher'
    },
    isTeacher() { return this.getRole() === 'teacher'; },
    isStudent()  { return this.getRole() === 'student'; },
    isAdmin()    { return this.getRole() === 'admin'; },
    isLoggedIn() { return !!this.getUser(); },

    /* ── club role helpers (cached per session) ── */
    _officerClubs: null,
    _teacherClubs: null,

    async loadClubRoles() {
        const user = this.getUser();
        if (!user) { this._officerClubs = []; this._teacherClubs = []; return; }
        try {
            if (user.role === 'student') {
                const rows = await DB.getOfficerClubs(user.idNumber);
                this._officerClubs = rows.map(r => r.club_id);
            } else if (user.role === 'teacher') {
                const rows = await DB.getAllClubTeachers();
                this._teacherClubs = rows.filter(r => r.teacher_id === user.idNumber).map(r => r.club_id);
            }
        } catch(e) { this._officerClubs = []; this._teacherClubs = []; }
    },

    isOfficerOf(clubId) {
        if (!this._officerClubs) return false;
        return this._officerClubs.includes(clubId);
    },

    isOfficerAny() {
        return this._officerClubs && this._officerClubs.length > 0;
    },

    isHandlerOf(clubId) {
        if (!this._teacherClubs) return false;
        return this._teacherClubs.includes(clubId);
    },

    /* ── guard: redirect if not logged in ── */
    requireLogin(redirectTo = 'index.html') {
        if (!this.isLoggedIn()) {
            window.location.href = redirectTo;
        }
    },

    /* ── guard: redirect students away from teacher-only pages ── */
    requireTeacher() {
        this.requireLogin();
        if (!this.isTeacher()) {
            alert('Access denied. This page is for teachers only.');
            window.location.href = 'Page_Main2_.html';
        }
    },

    /* ── logout ── */
    logout() {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        }
    },

    /* ── populate nav profile widgets ── */
    populateNav() {
        const user = this.getUser();
        if (!user) return;
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        setTxt('profileAvatar',  initials);
        setTxt('profileName',    user.name);
        // Compact: emoji icon + role · ID on one line
        const roleLabel = user.role === 'teacher' ? '👩‍🏫 Teacher' : '🎓 Student';
        setTxt('profileId', roleLabel + ' · ' + user.idNumber);
        setTxt('dropdownAvatar', initials);
        setTxt('dropdownName',   user.name);
        setTxt('dropdownEmail',  user.email);
    },

    /* ── build the correct Information dropdown based on role ── */
    buildInfoDropdown() {
        const dd = document.getElementById('infoDropdown');
        if (!dd) return;
        // Both students and teachers see Updates + Calendar
        dd.innerHTML = `
            <a href="updates.html">Updates</a>
            <a href="calendar.html">Calendar</a>`;
    },

    /* ── apply event-card visibility rules ── */
    applyEventRoles() {
        /* Teacher controls (Edit / Delete / Add New):
           Always hide first, then reveal only for teachers */
        if (this.isTeacher()) {
            document.querySelectorAll('.teacher-only').forEach(el => el.style.display = '');
        } else {
            document.querySelectorAll('.teacher-only').forEach(el => el.style.display = 'none');
        }
        /* Student-only controls: hide for non-students */
        if (!this.isStudent()) {
            document.querySelectorAll('.student-only').forEach(el => el.style.display = 'none');
        }
    }
};