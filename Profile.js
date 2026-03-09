const EMAILJS_SERVICE  = 'service_aqukwic';
const EMAILJS_TEMPLATE = 'template_1r7rcrf';
const EMAILJS_PUBKEY   = 'ePQ8Q2EnmNzgyy85W';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBKEY);
    wireCodeInputs('veCodeInputs');
});

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function getRelativeTime(d) {
    if (!d) return '—';
    const diff = Math.floor((Date.now() - new Date(d)) / 1000);
    if (diff < 60)    return 'Just now';
    if (diff < 3600)  return Math.floor(diff/60) + ' minutes ago';
    if (diff < 86400) return Math.floor(diff/3600) + ' hours ago';
    if (diff < 604800)return Math.floor(diff/86400) + ' days ago';
    return formatDate(d);
}
function calcAge(birthdate) {
    if (!birthdate) return null;
    const bd = new Date(birthdate), today = new Date();
    let age = today.getFullYear() - bd.getFullYear();
    const m = today.getMonth() - bd.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
    return age;
}
function wireCodeInputs(containerId) {
    const boxes = document.querySelectorAll('#' + containerId + ' input');
    boxes.forEach((box, i) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/[^0-9]/g, '');
            if (box.value && i < boxes.length - 1) boxes[i+1].focus();
        });
        box.addEventListener('keydown', e => { if (e.key === 'Backspace' && !box.value && i > 0) boxes[i-1].focus(); });
    });
}
function getCodeFromInputs(containerId) {
    return [...document.querySelectorAll('#' + containerId + ' input')].map(b => b.value).join('');
}
function clearCodeInputs(containerId) {
    document.querySelectorAll('#' + containerId + ' input').forEach(b => b.value = '');
}
function fpGoStep(prefix, n, total) {
    for (let i = 1; i <= total; i++) {
        const el = document.getElementById(prefix + i);
        if (el) el.classList.toggle('active', i === n);
    }
}
function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.classList.toggle('show', !!msg);
}

async function initProfile() {
    Auth.requireLogin();
    Auth.populateNav();
    Auth.buildInfoDropdown();
    Notifications.initUI();
    const session = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!session) return;
    const user = await DB.getUser(session.idNumber);
    if (!user) return;
    const fresh = { name:user.name, idNumber:user.id_number, email:user.email, role:user.role,
        emailVerified:user.email_verified||false, twoFactorAuth:user.two_factor_auth||false, birthdate:user.birthdate||null };
    localStorage.setItem('currentUser', JSON.stringify(fresh));
    renderProfile(user);
    loadUserStats(user.id_number);
    updateActivityList(user.id_number, user.signup_date);

    // Auto-open verify modal if redirected from banner on another page
    if (sessionStorage.getItem('openVerify') === '1') {
        sessionStorage.removeItem('openVerify');
        if (!user.email_verified) setTimeout(() => openVerifyEmailModal(), 400);
    }
};

function renderProfile(user) {
    const initials = (user.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('profileAvatarLarge').textContent = initials;
    document.getElementById('profileFullName').textContent    = user.name;
    document.getElementById('profileIdNumber').textContent    = user.id_number;
    document.getElementById('profileEmail').textContent       = user.email;
    const verified  = user.email_verified;
    const isTeacher = user.role === 'teacher';
    const vBadge = document.getElementById('badgeVerified');
    if (vBadge) {
        if (isTeacher) { vBadge.innerHTML='<i class="fas fa-check-circle"></i> Verified Teacher'; vBadge.style.cssText='background:#e6f7f0;color:#27ae60;'; }
        else if (verified) { vBadge.innerHTML='<i class="fas fa-check-circle"></i> Verified Student'; vBadge.style.cssText='background:#e6f7f0;color:#27ae60;'; }
        else { vBadge.innerHTML='<i class="fas fa-exclamation-circle"></i> Not Verified — Please verify your email'; vBadge.style.cssText='background:#fff3cd;color:#e67e22;'; }
    }
    const rBadge = document.getElementById('badgeRole');
    if (rBadge) rBadge.innerHTML = isTeacher ? '<i class="fas fa-chalkboard-teacher"></i> Faculty Member' : '<i class="fas fa-graduation-cap"></i> Active Member';
    document.getElementById('infoName').textContent  = user.name;
    document.getElementById('infoId').textContent    = user.id_number;
    document.getElementById('infoEmail').textContent = user.email;
    document.getElementById('infoMemberSince').textContent = formatDate(user.signup_date);
    const bdEl = document.getElementById('infoBirthdate');
    if (bdEl) {
        if (user.birthdate) {
            const age = calcAge(user.birthdate);
            bdEl.textContent = new Date(user.birthdate).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) + (age ? ' ('+age+' yrs old)' : '');
        } else { bdEl.textContent = '—'; }
    }
    document.getElementById('passwordChange').textContent = formatDate(user.last_pwd_change);
    const evStatus = document.getElementById('emailVerifiedStatus');
    const tfaStatus = document.getElementById('twoFactorStatus');
    const vBtn  = document.getElementById('verifyEmailBtn');
    const tfaBtn = document.getElementById('toggle2FABtn');
    if (evStatus)  { evStatus.textContent = verified ? '✅ Verified' : '❌ Not Verified'; evStatus.style.color = verified ? '#27ae60' : '#f44336'; }
    if (tfaStatus) { tfaStatus.textContent = user.two_factor_auth ? '✅ Enabled' : '❌ Not Enabled'; tfaStatus.style.color = user.two_factor_auth ? '#27ae60' : '#f44336'; }
    // Verify Email button: hide only if already verified (show for both students AND teachers)
    if (vBtn) {
        vBtn.style.display = verified ? 'none' : 'block';
    }
    // Show/hide top reminder banner (students only)
    const banner = document.getElementById('verifyReminderBanner');
    if (banner) banner.style.display = (!isTeacher && !verified) ? 'block' : 'none';
    // 2FA button: show for everyone; grey out if email not verified
    if (tfaBtn) {
        tfaBtn.innerHTML = user.two_factor_auth
            ? '<i class="fas fa-shield-alt"></i> Disable Two-Factor Auth'
            : '<i class="fas fa-shield-alt"></i> Enable Two-Factor Auth';
        tfaBtn.style.display = 'block';
        if (!verified) {
            // Greyed out until email is verified
            tfaBtn.style.background = 'linear-gradient(135deg,#aaa,#bbb)';
            tfaBtn.style.cursor = 'not-allowed';
            tfaBtn.style.opacity = '0.65';
            tfaBtn.title = 'Verify your email first to enable 2FA';
        } else {
            tfaBtn.style.cursor = 'pointer';
            tfaBtn.style.opacity = '1';
            tfaBtn.style.background = user.two_factor_auth
                ? 'linear-gradient(135deg,#c0392b,#e74c3c)'
                : 'linear-gradient(135deg,#2c5282,#0c82a0)';
            tfaBtn.title = '';
        }
    }
}

/* ── Verify Email ── */
let _veCode = '', _veTimer = null;
function openVerifyEmailModal() {
    document.getElementById('verifyEmailOverlay').classList.add('open');
    fpGoStep('veStep', 1, 3); showErr('veErr1','');
}
function closeVerifyEmailModal() {
    document.getElementById('verifyEmailOverlay').classList.remove('open');
    clearInterval(_veTimer); _veCode = ''; clearCodeInputs('veCodeInputs');
}
async function veSendCode() {
    const session = JSON.parse(localStorage.getItem('currentUser'));
    const btn = document.getElementById('veSendBtn');
    btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Sending...';
    try {
        _veCode = Math.floor(100000+Math.random()*900000).toString();
        await DB.setVerifyToken(session.idNumber, _veCode, new Date(Date.now()+10*60*1000).toISOString());
        if (typeof emailjs !== 'undefined') await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, { to_name:session.name, to_email:session.email, reset_code:_veCode+'\n\n(Email verification code for ACT-CCS)' });
        document.getElementById('veEmailDisplay').textContent = session.email;
        fpGoStep('veStep',2,3);
        clearInterval(_veTimer); let secs=600;
        const te = document.getElementById('veTimerDisplay');
        _veTimer = setInterval(()=>{ secs--; if(te){te.textContent=Math.floor(secs/60).toString().padStart(2,'0')+':'+(secs%60).toString().padStart(2,'0');} if(secs<=0){clearInterval(_veTimer);_veCode='';showErr('veErr2','Code expired.');} },1000);
    } catch(e) { showErr('veErr1','Failed to send code.'); console.error(e); }
    btn.disabled=false; btn.innerHTML='<i class="fas fa-paper-plane"></i> Send Verification Code';
}
async function veVerifyCode() {
    const entered = getCodeFromInputs('veCodeInputs');
    if (entered.length<6){ showErr('veErr2','Enter all 6 digits.'); return; }
    if (!_veCode){ showErr('veErr2','Code expired.'); return; }
    if (entered!==_veCode){ showErr('veErr2','Incorrect code.'); clearCodeInputs('veCodeInputs'); return; }
    try {
        const session = JSON.parse(localStorage.getItem('currentUser'));
        await DB.verifyEmail(session.idNumber);
        session.emailVerified=true; localStorage.setItem('currentUser',JSON.stringify(session));
        clearInterval(_veTimer); _veCode='';
        fpGoStep('veStep',3,3);
        const user = await DB.getUser(session.idNumber); renderProfile(user);
    } catch(e){ showErr('veErr2','Verification failed.'); }
}

/* ── 2FA Toggle ── */
async function toggle2FA() {
    const session = JSON.parse(localStorage.getItem('currentUser'));
    const user = await DB.getUser(session.idNumber);
    if (!user.email_verified) { alert('Please verify your email first before enabling Two-Factor Authentication.'); return; }
    const enabling = !user.two_factor_auth;
    if (!confirm(enabling ? 'Enable Two-Factor Authentication? You will need to enter a code from your email every time you log in.' : 'Disable Two-Factor Authentication?')) return;
    try {
        await DB.updateUserField(session.idNumber, { two_factor_auth: enabling });
        session.twoFactorAuth=enabling; localStorage.setItem('currentUser',JSON.stringify(session));
        const freshUser = await DB.getUser(session.idNumber); renderProfile(freshUser);
        alert(enabling ? '✅ Two-Factor Authentication enabled!' : 'Two-Factor Authentication disabled.');
    } catch(e){ alert('Failed to update. Please try again.'); }
}

/* ── Change Password ── */
function openChangePasswordModal() {
    document.getElementById('changePwdOverlay').classList.add('open');
    showErr('cpErr','');
    ['cpCurrentPwd','cpNewPwd','cpConfirmPwd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}
async function submitChangePassword() {
    const cur = document.getElementById('cpCurrentPwd').value;
    const np  = document.getElementById('cpNewPwd').value;
    const cp  = document.getElementById('cpConfirmPwd').value;
    if (!cur||!np||!cp){ showErr('cpErr','Please fill in all fields.'); return; }
    if (np.length<6)   { showErr('cpErr','New password must be at least 6 characters.'); return; }
    if (np!==cp)       { showErr('cpErr','New passwords do not match.'); return; }
    try {
        const session = JSON.parse(localStorage.getItem('currentUser'));
        const user = await DB.getUser(session.idNumber);
        if (user.password!==cur){ showErr('cpErr','Current password is incorrect.'); return; }
        await DB.updateUserPassword(session.idNumber, np);
        document.getElementById('changePwdOverlay').classList.remove('open');
        alert('✅ Password changed successfully!');
        const freshUser = await DB.getUser(session.idNumber); renderProfile(freshUser);
    } catch(e){ showErr('cpErr','Failed to update password.'); }
}

/* ── Stats & Activity ── */
async function loadUserStats(studentId) {
    let clubCount=0, eventCount=0;
    try{ const rows=await DB.getAllClubRegistrations(); clubCount=rows.filter(r=>r.student_id===studentId).length; }catch(e){}
    try{ const rows=await DB.getRegistrationsByStudent(studentId); eventCount=rows.length; }catch(e){}
    const el=document.querySelector('.stats-mini');
    if(el) el.innerHTML=`<div class="stat-mini"><h4>${clubCount}</h4><p>Clubs Joined</p></div><div class="stat-mini"><h4>${eventCount}</h4><p>Events Registered</p></div><div class="stat-mini"><h4>1</h4><p>Logins</p></div><div class="stat-mini"><h4>Active</h4><p>Status</p></div>`;
}
async function updateActivityList(studentId, signupTimestamp) {
    const activityList=document.getElementById('activityList'); if(!activityList) return;
    let regs=[]; try{ regs=(await DB.getRegistrationsByStudent(studentId)).map(r=>DB.rowToRegistration(r)); }catch(e){}
    let clubRegs=[]; try{ const rows=await DB.getAllClubRegistrations(); clubRegs=rows.filter(r=>r.student_id===studentId); }catch(e){}
    const CLUB_NAMES={rgs:'Responsible Gamers Society',sports:'Sports Club',multimedia:'Multimedia Club'};
    let html=`<div class="activity-item"><div class="activity-icon"><i class="fas fa-user-plus"></i></div><div class="activity-content"><h4>Account Created</h4><p>Registered to ACT-CCS Portal</p><span class="activity-time">${getRelativeTime(signupTimestamp)}</span></div></div>`;
    clubRegs.forEach(c=>{ html+=`<div class="activity-item"><div class="activity-icon"><i class="fas fa-users"></i></div><div class="activity-content"><h4>Joined ${CLUB_NAMES[c.club_id]||c.club_id}</h4><p>Became a club member</p><span class="activity-time">${getRelativeTime(c.joined_at)}</span></div></div>`; });
    regs.forEach(r=>{ html+=`<div class="activity-item"><div class="activity-icon"><i class="fas fa-calendar-check"></i></div><div class="activity-content"><h4>Registered for ${r.eventName}</h4><p>Event registration confirmed</p><span class="activity-time">${getRelativeTime(r.registeredAt)}</span></div></div>`; });
    html+=`<div class="activity-item"><div class="activity-icon"><i class="fas fa-sign-in-alt"></i></div><div class="activity-content"><h4>Logged In</h4><p>Accessed the system</p><span class="activity-time">Just now</span></div></div>`;
    activityList.innerHTML=html;
}

// Wait for all scripts to load before running
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfile);
} else {
    initProfile();
}

/* ══════════════════════════════════════
   EDIT PROFILE
══════════════════════════════════════ */
function openEditProfileModal() {
    const session = JSON.parse(localStorage.getItem('currentUser') || 'null');
    if (!session) return;
    document.getElementById('epName').value      = session.name  || '';
    document.getElementById('epEmail').value     = session.email || '';
    document.getElementById('epBirthdate').value = session.birthdate || '';
    updateEpAge();
    showErr('epErr', '');
    document.getElementById('editProfileOverlay').classList.add('open');

    document.getElementById('epBirthdate').addEventListener('change', updateEpAge);
}
function updateEpAge() {
    const bd = document.getElementById('epBirthdate').value;
    const el = document.getElementById('epAgeDisplay');
    if (!bd) { el.textContent = ''; return; }
    const age = calcAge(bd);
    el.textContent = age && age > 0 ? '🎂 Age: ' + age + ' years old' : '';
}
function closeEditProfileModal() {
    document.getElementById('editProfileOverlay').classList.remove('open');
}
async function submitEditProfile() {
    const name      = document.getElementById('epName').value.trim();
    const email     = document.getElementById('epEmail').value.trim().toLowerCase();
    const birthdate = document.getElementById('epBirthdate').value;
    if (!name)  { showErr('epErr', 'Full name is required.'); return; }
    if (!email) { showErr('epErr', 'Email address is required.'); return; }
    try {
        const session = JSON.parse(localStorage.getItem('currentUser'));
        // Check if email changed and already used by someone else
        if (email !== session.email) {
            const existing = await DB.getUserByEmail(email);
            if (existing && existing.id_number !== session.idNumber) {
                showErr('epErr', 'This email is already used by another account.');
                return;
            }
            // If email changed, reset verification for students
            if (session.role === 'student') {
                await DB.updateUserField(session.idNumber, { name, email, birthdate: birthdate || null, email_verified: false });
                session.emailVerified = false;
            } else {
                await DB.updateUserField(session.idNumber, { name, email, birthdate: birthdate || null });
            }
        } else {
            await DB.updateUserField(session.idNumber, { name, email, birthdate: birthdate || null });
        }
        // Update session
        session.name      = name;
        session.email     = email;
        session.birthdate = birthdate || null;
        localStorage.setItem('currentUser', JSON.stringify(session));
        closeEditProfileModal();
        // Refresh profile display
        const freshUser = await DB.getUser(session.idNumber);
        renderProfile(freshUser);
        alert('✅ Profile updated successfully!');
    } catch(e) { showErr('epErr', 'Failed to save changes. Please try again.'); console.error(e); }
}