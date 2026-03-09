/* Student Login & Sign Up — Supabase */

const EMAILJS_SERVICE  = 'service_aqukwic';
const EMAILJS_TEMPLATE = 'template_1r7rcrf';
const EMAILJS_PUBKEY   = 'ePQ8Q2EnmNzgyy85W';

function toggleForm() {
    const loginForm  = document.querySelector('.login-form');
    const signupForm = document.querySelector('.signup-form');
    const formTitle  = document.getElementById('form-title');
    const toggleText = document.getElementById('toggle-text');
    document.getElementById('successMessage').classList.remove('show');
    if (loginForm.classList.contains('active')) {
        loginForm.classList.remove('active'); signupForm.classList.add('active');
        formTitle.textContent = 'SIGN UP';
        toggleText.innerHTML = 'Already have an account? <a onclick="toggleForm()">Log In</a>';
    } else {
        signupForm.classList.remove('active'); loginForm.classList.add('active');
        formTitle.textContent = 'LOGIN';
        toggleText.innerHTML = 'Don\'t have an account? <a onclick="toggleForm()">Sign Up</a>';
    }
}

function showSuccess(msg) {
    const el = document.getElementById('successMessage');
    el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
}
function showSignupErr(msg) {
    const el = document.getElementById('signupErr');
    if (!el) return;
    el.textContent = msg; el.style.display = msg ? 'block' : 'none';
}

/* ── Auto-calculate age from birthdate ── */
document.addEventListener('DOMContentLoaded', () => {
    const bdInput = document.getElementById('signupBirthdate');
    if (bdInput) {
        bdInput.addEventListener('change', () => {
            const bd = new Date(bdInput.value);
            const today = new Date();
            let age = today.getFullYear() - bd.getFullYear();
            const m = today.getMonth() - bd.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
            const ageDiv = document.getElementById('signupAgeDisplay');
            const ageSpan = document.getElementById('signupAge');
            if (age > 0 && age < 120) {
                ageSpan.textContent = age + ' years old';
                ageDiv.style.display = 'block';
            } else {
                ageDiv.style.display = 'none';
            }
        });
    }
});

/* ── LOGIN — accepts Student ID or Email ── */
async function login(e) {
    e.preventDefault();
    const idOrEmail = document.getElementById('loginId').value.trim();
    const pwd       = document.getElementById('loginPassword').value;
    const btn = e.submitter || document.querySelector('.login-form input[type="submit"]');
    if (btn) { btn.disabled = true; btn.value = 'Logging in...'; }
    try {
        // Try ID first, then email
        let user = await DB.getUser(idOrEmail);
        if (!user) user = await DB.getUserByEmail(idOrEmail.toLowerCase());

        if (!user || user.role !== 'student') {
            if (user && user.role === 'teacher') alert('This is a Teacher account. Please use the Teacher portal.');
            else alert('Invalid Student ID / Email or Password.');
            if (btn) { btn.disabled = false; btn.value = 'Login'; }
            return;
        }
        if (user.password !== pwd) {
            alert('Invalid Student ID / Email or Password.');
            if (btn) { btn.disabled = false; btn.value = 'Login'; }
            return;
        }

        // Check 2FA
        if (user.two_factor_auth) {
            // Store pending user, trigger 2FA flow
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
        role:          'student',
        emailVerified: user.email_verified || false,
        twoFactorAuth: user.two_factor_auth || false,
        birthdate:     user.birthdate || null
    }));
    window.location.href = 'Page_Main2_.html';
}

/* ── SIGN UP ── */
async function signup(e) {
    e.preventDefault();
    showSignupErr('');
    const name      = document.getElementById('signupName').value.trim();
    const email     = document.getElementById('signupEmail').value.trim().toLowerCase();
    const birthdate = document.getElementById('signupBirthdate').value;
    const pwd       = document.getElementById('signupPassword').value;
    const confirm   = document.getElementById('signupConfirmPassword').value;

    if (!name || !email || !birthdate || !pwd) { showSignupErr('Please fill in all fields.'); return; }
    if (pwd.length < 6)  { showSignupErr('Password must be at least 6 characters.'); return; }
    if (pwd !== confirm) { showSignupErr('Passwords do not match.'); return; }

    const btn = e.submitter || document.querySelector('.signup-form input[type="submit"]');
    if (btn) { btn.disabled = true; btn.value = 'Creating account...'; }
    try {
        // Check email uniqueness
        const existingEmail = await DB.getUserByEmail(email);
        if (existingEmail) { showSignupErr('This email is already registered.'); if (btn) { btn.disabled=false; btn.value='Sign Up'; } return; }

        // Auto-generate student ID
        const newId = await DB.getNextStudentId();

        await DB.createUser({ idNumber: newId, name, email, password: pwd, role: 'student', birthdate });

        // Send verification email
        try {
            const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiry = new Date(Date.now() + 24*60*60*1000).toISOString(); // 24h
            await DB.setVerifyToken(newId, verifyCode, expiry);
            if (typeof emailjs !== 'undefined') {
                await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
                    to_name:    name,
                    to_email:   email,
                    reset_code: verifyCode + '\n\n(Use this code to verify your email in the portal)'
                });
            }
        } catch(emailErr) { console.warn('Verification email failed:', emailErr); }

        showSuccess('Account created! Your Student ID: ' + newId + '. Check your email to verify your account.');
        document.getElementById('signupForm').reset();
        document.getElementById('signupAgeDisplay').style.display = 'none';
        setTimeout(() => {
            toggleForm();
            document.getElementById('loginId').value = newId;
            document.getElementById('loginPassword').focus();
        }, 3500);
    } catch(err) {
        const msg = err.message || String(err);
        if (msg.includes('duplicate') || msg.includes('unique')) showSignupErr('This email is already registered.');
        else if (msg.includes('fetch') || msg.includes('network')) showSignupErr('Cannot reach the database. Check your internet connection.');
        else showSignupErr('Sign up failed: ' + msg);
        console.error('Signup error:', err);
    }
    if (btn) { btn.disabled = false; btn.value = 'Sign Up'; }
}

/* ═══════════ 2FA LOGIN MODAL ═══════════ */
function open2FAModal(user) {
    let overlay = document.getElementById('twoFALoginOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'twoFALoginOverlay';
        overlay.className = 'fp-overlay';
        overlay.innerHTML = `
        <div class="fp-box">
            <h3><i class="fas fa-shield-alt" style="color:#2c5282;margin-right:8px;"></i>Two-Factor Authentication</h3>
            <p>A 6-digit code has been sent to <strong id="tfa2Email"></strong>. Enter it to continue.</p>
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
        // Wire up code inputs
        const boxes = overlay.querySelectorAll('#tfa2Inputs input');
        boxes.forEach((box,i) => {
            box.addEventListener('input', () => { box.value=box.value.replace(/[^0-9]/g,''); if(box.value&&i<boxes.length-1) boxes[i+1].focus(); });
            box.addEventListener('keydown', e => { if(e.key==='Backspace'&&!box.value&&i>0) boxes[i-1].focus(); });
        });
    }
    overlay.classList.add('open');
    document.getElementById('tfa2Email').textContent = user.email;

    // Send code
    window._2faCode = Math.floor(100000 + Math.random()*900000).toString();
    window._2faTimer = 600;
    clearInterval(window._2faTimerInt);
    window._2faTimerInt = setInterval(() => {
        window._2faTimer--;
        const el = document.getElementById('tfa2Timer');
        if(el) { const m=Math.floor(window._2faTimer/60).toString().padStart(2,'0'); const s=(window._2faTimer%60).toString().padStart(2,'0'); el.textContent=m+':'+s; }
        if(window._2faTimer<=0) { clearInterval(window._2faTimerInt); window._2faCode=''; }
    }, 1000);

    if (typeof emailjs !== 'undefined') {
        emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
            to_name:    user.name,
            to_email:   user.email,
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
    if (entered.length < 6) { errEl.textContent = 'Enter all 6 digits.'; errEl.classList.add('show'); return; }
    if (!window._2faCode)   { errEl.textContent = 'Code expired. Please log in again.'; errEl.classList.add('show'); return; }
    if (entered !== window._2faCode) {
        errEl.textContent = 'Incorrect code. Please try again.';
        errEl.classList.add('show');
        document.querySelectorAll('#tfa2Inputs input').forEach(b => b.value = '');
        document.querySelector('#tfa2Inputs input').focus();
        return;
    }
    // Save user BEFORE closing modal (close2FAModal nulls _pending2FAUser)
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
document.addEventListener('DOMContentLoaded', () => {
    updateOnlineStatus();
    if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBKEY);
});