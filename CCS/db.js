/* ============================================================
   db.js — ACT-CCS Portal Supabase Database Layer
   Replaces ALL localStorage data calls.
   currentUser session still uses localStorage (browser session only).
   ============================================================ */

const SUPABASE_URL = 'https://eojxwiasyttoavotzqfb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVvanh3aWFzeXR0b2F2b3R6cWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTM5MzYsImV4cCI6MjA4ODQyOTkzNn0.Taft4J4NsPp7VM9twkwhxcrMnuu_or7lme9dD4nVLHc';

/* ── Base fetch helper ── */
async function sbFetch(path, options = {}) {
    const url = SUPABASE_URL + '/rest/v1/' + path;
    const headers = {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type':  'application/json',
        'Prefer':        options.prefer || 'return=representation',
        ...options.headers
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`DB Error [${res.status}]: ${err}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : [];
}

/* ── Shorthand methods ── */
const DB = {

    /* ════════════════════════════════
       USERS
       ════════════════════════════════ */

    async getUser(idNumber) {
        const rows = await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}&limit=1`);
        return rows[0] || null;
    },

    async updateUserPassword(idNumber, newPassword) {
        return await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}`, {
            method: 'PATCH',
            body: JSON.stringify({ password: newPassword, last_pwd_change: new Date().toISOString() })
        });
    },

    async getAllUsers() {
        return await sbFetch('users?order=signup_date.desc');
    },

    async createUser({ idNumber, name, email, password, role, birthdate }) {
        return await sbFetch('users', {
            method: 'POST',
            body: JSON.stringify({
                id_number:      idNumber,
                name,
                email,
                password,
                role,
                birthdate:      birthdate || null,
                email_verified: false,
                two_factor_auth: false,
                signup_date:    new Date().toISOString(),
                last_pwd_change: new Date().toISOString()
            })
        });
    },

    async getNextStudentId() {
        // Get highest existing 26-XXXXXXX or find gap
        const rows = await sbFetch("users?id_number=like.26-*&role=eq.student&order=id_number.asc");
        const used = rows.map(r => parseInt((r.id_number || '').replace('26-', ''), 10)).filter(n => !isNaN(n)).sort((a,b)=>a-b);
        let next = 1;
        for (const n of used) { if (n === next) next++; else break; }
        return '26-' + String(next).padStart(7, '0');
    },

    async getUserByEmail(email) {
        const rows = await sbFetch(`users?email=ilike.${encodeURIComponent(email.toLowerCase())}&limit=1`);
        return rows[0] || null;
    },

    async updateUserField(idNumber, fields) {
        return await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}`, {
            method: 'PATCH',
            body: JSON.stringify(fields)
        });
    },

    async setVerifyToken(idNumber, token, expiry) {
        return await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}`, {
            method: 'PATCH',
            body: JSON.stringify({ verify_token: token, verify_token_exp: expiry })
        });
    },

    async verifyEmail(idNumber) {
        return await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}`, {
            method: 'PATCH',
            body: JSON.stringify({ email_verified: true, verify_token: null, verify_token_exp: null })
        });
    },

    async deleteUser(idNumber) {
        return await sbFetch(`users?id_number=eq.${encodeURIComponent(idNumber)}`, {
            method: 'DELETE',
            prefer: 'return=minimal'
        });
    },

    /* ════════════════════════════════
       EVENTS
       ════════════════════════════════ */

    async getAllEvents() {
        return await sbFetch('events?order=start_date.asc');
    },

    async getApprovedEvents() {
        return await sbFetch('events?approval_status=eq.approved&order=start_date.asc');
    },

    async getEventById(id) {
        const rows = await sbFetch(`events?id=eq.${encodeURIComponent(id)}&limit=1`);
        return rows[0] || null;
    },

    async createEvent(ev) {
        return await sbFetch('events', {
            method: 'POST',
            body: JSON.stringify({
                id:              ev.id,
                type:            ev.type,
                name:            ev.name,
                start_date:      ev.startDate,
                end_date:        ev.endDate,
                start_time:      ev.startTime,
                end_time:        ev.endTime,
                venue:           ev.venue,
                description:     ev.description || null,
                approval_status: 'pending',
                created_by:      ev.createdBy || null,
                created_at:      new Date().toISOString(),
                modified_at:     new Date().toISOString()
            })
        });
    },

    async updateEvent(id, ev) {
        return await sbFetch(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                type:        ev.type,
                name:        ev.name,
                start_date:  ev.startDate,
                end_date:    ev.endDate,
                start_time:  ev.startTime,
                end_time:    ev.endTime,
                venue:       ev.venue,
                description:  ev.description  || null,
                att_duration: ev.attDuration || null,
                modified_at:  new Date().toISOString()
            })
        });
    },

    async approveEvent(id) {
        return await sbFetch(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                approval_status: 'approved',
                approved_at:     new Date().toISOString(),
                deny_reason:     null
            })
        });
    },

    async denyEvent(id, reason) {
        return await sbFetch(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({
                approval_status: 'denied',
                denied_at:       new Date().toISOString(),
                deny_reason:     reason || null
            })
        });
    },

    async deleteEvent(id) {
        return await sbFetch(`events?id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            prefer: 'return=minimal'
        });
    },

    /* ════════════════════════════════
       REGISTRATIONS
       ════════════════════════════════ */

    async getAllRegistrations() {
        return await sbFetch('registrations?order=registered_at.desc');
    },

    async getRegistrationsByEvent(eventId) {
        return await sbFetch(`registrations?event_id=eq.${encodeURIComponent(eventId)}&order=registered_at.asc`);
    },

    async getRegistrationsByStudent(studentId) {
        return await sbFetch(`registrations?student_id=eq.${encodeURIComponent(studentId)}&order=registered_at.desc`);
    },

    async getRegistration(eventId, studentId) {
        const rows = await sbFetch(
            `registrations?event_id=eq.${encodeURIComponent(eventId)}&student_id=eq.${encodeURIComponent(studentId)}&limit=1`
        );
        return rows[0] || null;
    },

    async createRegistration(reg) {
        return await sbFetch('registrations', {
            method: 'POST',
            body: JSON.stringify({
                registration_id: reg.registrationId,
                event_id:        reg.eventId,
                student_id:      reg.studentId,
                event_name:      reg.eventName,
                event_type:      reg.eventType,
                full_name:       reg.fullName,
                first_name:      reg.firstName,
                last_name:       reg.lastName,
                year_level:      reg.yearLevel,
                program:         reg.program,
                email:           reg.email,
                registered_at:   new Date().toISOString()
            })
        });
    },

    async deleteRegistration(eventId, studentId) {
        return await sbFetch(
            `registrations?event_id=eq.${encodeURIComponent(eventId)}&student_id=eq.${encodeURIComponent(studentId)}`,
            { method: 'DELETE', prefer: 'return=minimal' }
        );
    },

    /* ════════════════════════════════
       ATTENDANCE
       ════════════════════════════════ */

    async getAttendance(eventId, studentId) {
        const rows = await sbFetch(
            `attendance?event_id=eq.${encodeURIComponent(eventId)}&student_id=eq.${encodeURIComponent(studentId)}&limit=1`
        );
        return rows[0] || null;
    },

    async getAttendanceByEvent(eventId) {
        return await sbFetch(`attendance?event_id=eq.${encodeURIComponent(eventId)}`);
    },

    async submitAttendance(record) {
        // upsert — insert or update if already exists
        return await sbFetch('attendance', {
            method:  'POST',
            prefer:  'resolution=merge-duplicates,return=representation',
            headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify({
                event_id:     record.eventId,
                student_id:   record.studentId,
                student_name: record.studentName,
                year_level:   record.yearLevel,
                program:      record.program,
                condition:    record.condition,
                remarks:      record.remarks || null,
                submitted_at: new Date().toISOString()
            })
        });
    },

    async insertAttendanceDay(record) {
        // Insert fresh row for multi-day attendance (ignores UNIQUE conflict gracefully)
        try {
            return await sbFetch('attendance', {
                method:  'POST',
                prefer:  'return=representation',
                headers: { 'Prefer': 'return=representation' },
                body: JSON.stringify({
                    id:           'ATT-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
                    event_id:     record.eventId,
                    student_id:   record.studentId + '_' + record.sessionDay, // composite to bypass unique
                    student_name: record.studentName,
                    year_level:   record.yearLevel,
                    program:      record.program,
                    condition:    record.condition,
                    remarks:      record.remarks || null,
                    submitted_at: new Date().toISOString()
                })
            });
        } catch(e) {
            // Fallback to upsert if insert fails
            return await this.submitAttendance(record);
        }
    },

    /* ════════════════════════════════
       NOTIFICATIONS
       ════════════════════════════════ */

    async getNotifications(userId) {
        return await sbFetch(
            `notifications?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=100`
        );
    },

    async createNotification({ userId, type, title, message, link }) {
        return await sbFetch('notifications', {
            method: 'POST',
            body: JSON.stringify({
                id:         'n_' + Date.now() + '_' + Math.random().toString(36).slice(2),
                user_id:    userId,
                type,
                title,
                message,
                link:       link || 'updates.html',
                is_read:    false,
                created_at: new Date().toISOString()
            })
        });
    },

    async markNotificationRead(notifId) {
        return await sbFetch(`notifications?id=eq.${encodeURIComponent(notifId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_read: true })
        });
    },

    async markAllNotificationsRead(userId) {
        return await sbFetch(
            `notifications?user_id=eq.${encodeURIComponent(userId)}&is_read=eq.false`,
            { method: 'PATCH', body: JSON.stringify({ is_read: true }) }
        );
    },

    async unreadCount(userId) {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${encodeURIComponent(userId)}&is_read=eq.false&select=id`,
            {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_KEY
                }
            }
        );
        const rows = await res.json();
        return Array.isArray(rows) ? rows.length : 0;
    },

    /* ════════════════════════════════
       HELPERS — convert DB row → app object
       ════════════════════════════════ */

    rowToEvent(row) {
        return {
            id:             row.id,
            type:           row.type,
            name:           row.name,
            startDate:      row.start_date,
            endDate:        row.end_date,
            startTime:      row.start_time ? row.start_time.slice(0,5) : '',
            endTime:        row.end_time   ? row.end_time.slice(0,5)   : '',
            venue:          row.venue,
            description:    row.description || '',
            approvalStatus: row.approval_status,
            denyReason:     row.deny_reason || '',
            createdBy:      row.created_by || '',
            clubOnly:       row.club_only    || false,
            clubId:         row.club_id      || null,
            attDuration:    row.att_duration || null,
            description:    row.description || '',
            created:        row.created_at,
            modified:       row.modified_at
        };
    },

    rowToRegistration(row) {
        return {
            registrationId: row.registration_id,
            eventId:        row.event_id,
            studentId:      row.student_id,
            eventName:      row.event_name,
            eventType:      row.event_type,
            fullName:       row.full_name,
            firstName:      row.first_name,
            lastName:       row.last_name,
            yearLevel:      row.year_level,
            program:        row.program,
            email:          row.email,
            registeredAt:   row.registered_at
        };
    },

    rowToAttendance(row) {
        return {
            eventId:     row.event_id,
            studentId:   row.student_id,
            studentName: row.student_name,
            yearLevel:   row.year_level,
            program:     row.program,
            condition:   row.condition,
            remarks:     row.remarks || '',
            submittedAt: row.submitted_at
        };
    },

    rowToNotification(row) {
        return {
            id:        row.id,
            type:      row.type,
            title:     row.title,
            message:   row.message,
            link:      row.link,
            read:      row.is_read,
            timestamp: row.created_at
        };
    },

    rowToUser(row) {
        return {
            idNumber:   row.id_number,
            name:       row.name,
            email:      row.email,
            role:       row.role,
            signupDate: row.signup_date
        };
    },
    /* ════════════════════════════════
       EVENTS — club-only support
       ════════════════════════════════ */

    async getClubOnlyEvents(clubId) {
        return await sbFetch(`events?club_only=eq.true&club_id=eq.${encodeURIComponent(clubId)}&approval_status=eq.approved&order=start_date.asc`);
    },

    async createEvent(ev) {
        return await sbFetch('events', {
            method: 'POST',
            body: JSON.stringify({
                id:              ev.id,
                type:            ev.type,
                name:            ev.name,
                start_date:      ev.startDate,
                end_date:        ev.endDate,
                start_time:      ev.startTime,
                end_time:        ev.endTime,
                venue:           ev.venue,
                description:     ev.description || null,
                approval_status: 'pending',
                created_by:      ev.createdBy || null,
                club_only:       ev.clubOnly   || false,
                club_id:         ev.clubId     || null,
                att_duration:    ev.attDuration || null,
                created_at:      new Date().toISOString(),
                modified_at:     new Date().toISOString()
            })
        });
    },

    /* ════════════════════════════════
       CLUB TEACHERS
       ════════════════════════════════ */

    async getAllClubTeachers() {
        return await sbFetch('club_teachers?order=assigned_at.asc');
    },

    async getClubTeacher(clubId) {
        const rows = await sbFetch(`club_teachers?club_id=eq.${encodeURIComponent(clubId)}&limit=1`);
        return rows[0] || null;
    },

    async assignClubTeacher(clubId, teacherId) {
        // upsert: replace existing if any
        await sbFetch(`club_teachers?club_id=eq.${encodeURIComponent(clubId)}`, { method:'DELETE', prefer:'return=minimal' });
        return await sbFetch('club_teachers', {
            method: 'POST',
            body: JSON.stringify({
                id:          'CT-' + Date.now(),
                club_id:     clubId,
                teacher_id:  teacherId,
                assigned_at: new Date().toISOString()
            })
        });
    },

    async removeClubTeacher(clubId) {
        return await sbFetch(`club_teachers?club_id=eq.${encodeURIComponent(clubId)}`,
            { method:'DELETE', prefer:'return=minimal' });
    },

    /* ════════════════════════════════
       CLUB OFFICERS
       ════════════════════════════════ */

    async getClubOfficers(clubId) {
        return await sbFetch(`club_officers?club_id=eq.${encodeURIComponent(clubId)}&order=assigned_at.asc`);
    },

    async getOfficerClubs(studentId) {
        return await sbFetch(`club_officers?student_id=eq.${encodeURIComponent(studentId)}`);
    },

    async assignOfficer(clubId, studentId, title) {
        return await sbFetch('club_officers', {
            method: 'POST',
            body: JSON.stringify({
                id:          'CO-' + Date.now() + '-' + Math.random().toString(36).slice(2,5),
                club_id:     clubId,
                student_id:  studentId,
                title:       title || 'Officer',
                assigned_at: new Date().toISOString()
            })
        });
    },

    async removeOfficer(clubId, studentId) {
        return await sbFetch(
            `club_officers?club_id=eq.${encodeURIComponent(clubId)}&student_id=eq.${encodeURIComponent(studentId)}`,
            { method:'DELETE', prefer:'return=minimal' }
        );
    },

    /* ════════════════════════════════
       CLUB ANNOUNCEMENTS
       ════════════════════════════════ */

    async getClubAnnouncements(clubId) {
        return await sbFetch(`club_announcements?club_id=eq.${encodeURIComponent(clubId)}&order=created_at.desc`);
    },

    async createAnnouncement({ clubId, authorId, authorName, title, body }) {
        return await sbFetch('club_announcements', {
            method: 'POST',
            body: JSON.stringify({
                id:          'ANN-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
                club_id:     clubId,
                author_id:   authorId,
                author_name: authorName,
                title,
                body,
                created_at:  new Date().toISOString()
            })
        });
    },

    async deleteAnnouncement(id) {
        return await sbFetch(`club_announcements?id=eq.${encodeURIComponent(id)}`,
            { method:'DELETE', prefer:'return=minimal' });
    },


    /* ════════════════════════════════
       CLUB REGISTRATIONS
       ════════════════════════════════ */

    async getAllClubRegistrations() {
        return await sbFetch('club_registrations?order=joined_at.desc');
    },

    async getClubRegistrationsByStudent(studentId) {
        return await sbFetch(`club_registrations?student_id=eq.${encodeURIComponent(studentId)}`);
    },

    async createClubRegistration({ clubId, clubName, studentId, fullName, yearLevel, program, email }) {
        return await sbFetch('club_registrations', {
            method: 'POST',
            body: JSON.stringify({
                id:         'CR-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
                club_id:    clubId,
                club_name:  clubName,
                student_id: studentId,
                full_name:  fullName,
                year_level: yearLevel,
                program:    program,
                email:      email,
                joined_at:  new Date().toISOString()
            })
        });
    },

    async deleteClubRegistration(clubId, studentId) {
        return await sbFetch(
            `club_registrations?club_id=eq.${encodeURIComponent(clubId)}&student_id=eq.${encodeURIComponent(studentId)}`,
            { method: 'DELETE', prefer: 'return=minimal' }
        );
    },

};