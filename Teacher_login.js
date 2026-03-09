/* Teacher Login — Admin-generated accounts only */

const EMAILJS_SERVICE  = 'service_aqukwic';
const EMAILJS_TEMPLATE = 'template_1r7rcrf';
const EMAILJS_PUBKEY   = 'ePQ8Q2EnmNzgyy85W';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBKEY);
    updateOnlineStatus();
});

function showSuccess(msg) {
    const el = document.getElementById('successMessage');
    if (!el) return;
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}

/* ── LOGIN — accepts Teacher ID or Email ── */
async function login(e) {
    e.preventDefault();
    const idOrEmail = document.getElementById('loginId').value.trim();
    const pwd       = document.getElementById('loginPassword').value;
    const btn = e.submitter || document.querySelector('.login-form input[type="submit"]');
    if (btn) { btn.disabled = true; btn.value = 'Logging in...'; }
    try {
        // Try by ID first, then by email (case-insensitive)
        let user = await DB.getUser(idOrEmail);
        if (!user) user = await DB.getUserByEmail(idOrEmail.toLowerCase());

        if (!user || user.role !== 'teacher') {
            if (user && user.role === 'student') alert('This is a Student account. Please use the Student portal.');
            else alert('Invalid Teacher ID / Email or Password.');
            if (btn) { btn.disabled = false; btn.value = 'Login'; }
            return;
        }
        if (user.password !== pwd) {
            alert('Invalid Teacher ID / Email or Password.');
            if (btn) { btn.disabled = false; btn.value = 'Login'; }
            return;
        }

        // Check 2FA
        if (user.two_factor_auth) {
            window._pending2FAUser = user;
            open2FAModal(user);
            if (btn) { btn.disabled = false; btn.value = 'Login'; }
            return;
        }

        completeLogin(user);
    } catch(err) {
        alert('Connection error. Please try again.');
        console.error(err);
    }
    if (btn) { btn.disabled = false; btn.value = 'Login'; }
}

function completeLogin(user) {
    localStorage.setItem('currentUser', JSON.stringify({
        name:          user.name,
        idNumber:      user.id_number,
        email:         user.email,
        role:          'teacher',
        emailVerified: user.email_verified || false,
        twoFactorAuth: user.two_factor_auth || false
    }));
    window.location.href = 'Page_Main2_.html';
}

/* ═══════════ 2FA LOGIN MODAL ═══════════ */
function open2FAModal(user) {
    let overlay = document.getElementById('twoFALoginOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'twoFALoginOverlay';
        overlay.className = 'fp-overlay';   /* NOT 'open' — prevents blocking clicks */
        overlay.innerHTML = `
        <div class="fp-box">
            <h3><i class="fas fa-shield-alt" style="color:#2c5282;margin-right:8px;"></i>Two-Factor Authentication</h3>
            <p>A 6-digit code has been sent to <strong id="tfa2Email"></strong>.</p>
            <div class="fp-code-inputs" id="tfa2Inputs">
                <input type="text" maxlength="1" inputmode="numeric"/>
                <input type="text" maxlength="1" inputmode="numeric"/>
                <input type="text" maxlength="1" inputmode="numeric"/>
                <input type="text" maxlength="1" inputmode="numeric"/>
                <input type="text" maxlength="1" inputmode="numeric"/>
                <input type="text" maxlength="1" inputmode="numeric"/>
            </div>
            <div class="fp-timer">Code expires in <span id="tfa2Timer">10:00</span></div>
            <div class="fp-error" id="tfa2Err"></div>
            <button class="fp-btn" onclick="verify2FALogin()"><i class="fas fa-check-circle"></i> Verify & Login</button>
            <button class="fp-btn-ghost" onclick="close2FAModal()">Cancel</button>
        </div>`;
        document.body.appendChild(overlay);
        const boxes = overlay.querySelectorAll('#tfa2Inputs input');
        boxes.forEach((box,i) => {
            box.addEventListener('input', () => { box.value=box.value.replace(/[^0-9]/g,''); if(box.value&&i<boxes.length-1) boxes[i+1].focus(); });
            box.addEventListener('keydown', e => { if(e.key==='Backspace'&&!box.value&&i>0) boxes[i-1].focus(); });
        });
    }
    overlay.classList.add('open');
    document.getElementById('tfa2Email').textContent = user.email;
    window._2faCode = Math.floor(100000 + Math.random()*900000).toString();
    window._2faTimer = 600;
    clearInterval(window._2faTimerInt);
    window._2faTimerInt = setInterval(() => {
        window._2faTimer--;
        const el = document.getElementById('tfa2Timer');
        if(el) { el.textContent = Math.floor(window._2faTimer/60).toString().padStart(2,'0') + ':' + (window._2faTimer%60).toString().padStart(2,'0'); }
        if(window._2faTimer<=0) { clearInterval(window._2faTimerInt); window._2faCode=''; }
    }, 1000);
    if (typeof emailjs !== 'undefined') {
        emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
            to_name: user.name, to_email: user.email,
            reset_code: window._2faCode + '\n\n(Two-Factor Authentication code)'
        }).catch(e => console.warn('2FA email error:', e));
    }
}

function close2FAModal() {
    const o = document.getElementById('twoFALoginOverlay');
    if(o) o.classList.remove('open');
    clearInterval(window._2faTimerInt);
    window._pending2FAUser = null;
}

function verify2FALogin() {
    const entered = [...document.querySelectorAll('#tfa2Inputs input')].map(b=>b.value).join('');
    const errEl = document.getElementById('tfa2Err');
    if(entered.length<6) { errEl.textContent='Enter all 6 digits.'; errEl.classList.add('show'); return; }
    if(!window._2faCode) { errEl.textContent='Code expired. Please log in again.'; errEl.classList.add('show'); return; }
    if(entered!==window._2faCode) { errEl.textContent='Incorrect code.'; errEl.classList.add('show'); document.querySelectorAll('#tfa2Inputs input').forEach(b=>b.value=''); return; }
    const userToLogin = window._pending2FAUser;
    clearInterval(window._2faTimerInt);
    close2FAModal();
    completeLogin(userToLogin);
}

/* ── Offline Detection ── */
function updateOnlineStatus() {
    const banner = document.getElementById('offlineBanner');
    const toast  = document.getElementById('onlineToast');
    if (!navigator.onLine) {
        if (banner) banner.classList.add('show');
    } else {
        if (banner && banner.classList.contains('show')) {
            banner.classList.remove('show');
            if (toast) { toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }
        }
    }
}
window.addEventListener('online',  updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);