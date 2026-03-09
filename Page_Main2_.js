let currentTab = 'all';
        let events = [];

        // Toggle mobile menu
        function toggleMenu() {
            const navMenu = document.getElementById('navMenu');
            navMenu.classList.toggle('active');
        }

        // Toggle profile dropdown
        function toggleProfileDropdown() {
            const dropdown = document.getElementById('profileDropdown');
            dropdown.classList.toggle('show');
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function (event) {
            const profile = document.querySelector('.user-profile');
            const dropdown = document.getElementById('profileDropdown');

            if (profile && !profile.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Load user data
        function loadUserData() {
            Auth.requireLogin();
            Auth.populateNav();
            Auth.buildInfoDropdown();

            // Hide "New Event" button for students (they go to Events.html only to register)
            if (Auth.isStudent()) {
                const newEvtBtn = document.querySelector('.btn-primary');
                if (newEvtBtn) newEvtBtn.style.display = 'none';
                const exportBtn = document.querySelector('.btn-export');
                if (exportBtn) exportBtn.style.display = 'none';
            }
        }

        // Initialize dashboard
        async function init() {
            loadUserData();
            await loadEvents();
            updateStats();
            renderTable();

            // Search functionality
            document.getElementById('searchInput').addEventListener('input', function () {
                renderTable();
            });
        }

        // Load events from Supabase
        async function loadEvents() {
            try {
                const rows = Auth.isStudent()
                    ? await DB.getApprovedEvents()
                    : await DB.getAllEvents();
                const allEvs = rows.map(r => DB.rowToEvent(r));

                if (Auth.isStudent()) {
                    const user = Auth.getUser();
                    let memberClubs = [];
                    try {
                        const clubRegs = await DB.getClubRegistrationsByStudent(user.idNumber);
                        memberClubs = clubRegs.map(r => r.club_id);
                    } catch(e) {}
                    // Hide club-only events unless student is a member of that club
                    events = allEvs.filter(ev => !ev.clubOnly || memberClubs.includes(ev.clubId));
                } else {
                    events = allEvs;
                }
            } catch(e) { events = []; console.error('loadEvents:', e); }
        }

        // Get event status based on dates
        function getEventStatus(event) {
            const now = new Date();

            // Use actual start date + start time
            const [startHr, startMin] = event.startTime.split(':').map(Number);
            const start = new Date(event.startDate);
            start.setHours(startHr, startMin, 0, 0);

            // Use actual end date + end time for exact cutoff
            const [endHr, endMin] = event.endTime.split(':').map(Number);
            const end = new Date(event.endDate);
            end.setHours(endHr, endMin, 0, 0);

            if (now < start) {
                return 'upcoming';
            } else if (now >= start && now <= end) {
                return 'ongoing';
            } else {
                return 'completed';
            }
        }

        // Update statistics
        function updateStats() {
            const visibleEvents = Auth.isStudent()
                ? events.filter(e => e.approvalStatus === 'approved')
                : events;
            const academicCount = visibleEvents.filter(e => e.type === 'academic').length;
            const culturalCount = visibleEvents.filter(e => e.type === 'cultural').length;

            document.getElementById('academicCount').textContent = academicCount;
            document.getElementById('culturalCount').textContent = culturalCount;
            document.getElementById('totalCount').textContent = visibleEvents.length;
        }

        // Switch tab
        function switchTab(tab) {
            currentTab = tab;

            // Update button states
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => { if(b.textContent.trim().toLowerCase().includes(tab === 'all' ? 'all' : tab)) b.classList.add('active'); });

            renderTable();
        }

        // Format date
        function formatDate(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }

        // Format time
        function formatTime(time24) {
            const [hours, minutes] = time24.split(':');
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${ampm}`;
        }

        // Render table
        function renderTable() {
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();

            let filtered = events.filter(e => {
                // Students only see approved events; teachers see all
                if (Auth.isStudent() && e.approvalStatus !== 'approved') return false;

                const matchesTab = currentTab === 'all' || e.type === currentTab;
                const matchesSearch = searchTerm === '' ||
                    e.name.toLowerCase().includes(searchTerm) ||
                    e.venue.toLowerCase().includes(searchTerm) ||
                    (e.description && e.description.toLowerCase().includes(searchTerm));

                return matchesTab && matchesSearch;
            });

            const container = document.getElementById('tableContent');

            if (filtered.length === 0) {
                container.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-calendar-times"></i>
                            <h3>No Events Found</h3>
                            <p>No events match your current filter or search. Click "New Event" to create one.</p>
                        </div>
                    `;
                return;
            }

            // Sort by start date
            filtered.sort((a, b) => {
                const dateA = new Date(a.startDate);
                const dateB = new Date(b.startDate);
                return dateA - dateB;
            });

            let html = `
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Event ID</th>
                                <th>Event Name</th>
                                <th>Type</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Time</th>
                                <th>Venue</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

            filtered.forEach((event, index) => {
                const status = getEventStatus(event);
                const actualIndex = events.findIndex(e => e.id === event.id);

                html += `
                        <tr>
                            <td><strong>${event.id}</strong></td>
                            <td>${event.name}</td>
                            <td><span class="badge ${event.type}">${event.type === 'academic' ? 'Academic' : 'Cultural'}</span></td>
                            <td>${formatDate(event.startDate)}</td>
                            <td>${formatDate(event.endDate)}</td>
                            <td>${formatTime(event.startTime)} - ${formatTime(event.endTime)}</td>
                            <td>${event.venue}</td>
                            <td><span class="badge status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
                            <td>
                                <button class="action-btn view" onclick="viewEvent(${actualIndex})">
                                    <i class="fas fa-eye"></i> View
                                </button>
                            </td>
                        </tr>
                    `;
            });

            html += `
                        </tbody>
                    </table>
                `;

            container.innerHTML = html;
        }

        // View event details
        function viewEvent(index) {
            const event = events[index];
            const status = getEventStatus(event);

            // Update modal header color based on event type
            const modalHeader = document.getElementById('modalHeaderType');
            if (event.type === 'cultural') {
                modalHeader.classList.add('cultural');
            } else {
                modalHeader.classList.remove('cultural');
            }

            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                    <div class="detail-row">
                        <div class="detail-label">Event ID:</div>
                        <div class="detail-value"><strong>${event.id}</strong></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Event Name:</div>
                        <div class="detail-value"><strong>${event.name}</strong></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Event Type:</div>
                        <div class="detail-value"><span class="badge ${event.type}">${event.type === 'academic' ? 'Academic' : 'Cultural'}</span></div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Start Date:</div>
                        <div class="detail-value">${formatDate(event.startDate)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">End Date:</div>
                        <div class="detail-value">${formatDate(event.endDate)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Time:</div>
                        <div class="detail-value">${formatTime(event.startTime)} - ${formatTime(event.endTime)}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Venue:</div>
                        <div class="detail-value">${event.venue}</div>
                    </div>
                    <div class="detail-row">
                        <div class="detail-label">Status:</div>
                        <div class="detail-value"><span class="badge status-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></div>
                    </div>
                    ${event.description ? `
                    <div class="detail-row">
                        <div class="detail-label">Description:</div>
                        <div class="detail-value">${event.description}</div>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                        <div class="detail-label">Created:</div>
                        <div class="detail-value">${new Date(event.created).toLocaleString()}</div>
                    </div>
                    ${event.modified ? `
                    <div class="detail-row">
                        <div class="detail-label">Last Modified:</div>
                        <div class="detail-value">${new Date(event.modified).toLocaleString()}</div>
                    </div>
                    ` : ''}
                `;

            document.getElementById('detailModal').style.display = 'block';
        }

        // Close modal
        function closeModal() {
            document.getElementById('detailModal').style.display = 'none';
        }

        // Close modal when clicking outside
        window.onclick = function (e) {
            const modal = document.getElementById('detailModal');
            if (e.target === modal) {
                closeModal();
            }
        }

        // Export to CSV
        function exportToCSV() {
            if (events.length === 0) {
                alert('No events to export');
                return;
            }

            let csv = 'Event ID,Event Name,Type,Start Date,End Date,Start Time,End Time,Venue,Status,Description,Created,Modified\n';

            events.forEach(event => {
                const status = getEventStatus(event);
                const row = [
                    event.id,
                    `"${event.name}"`,
                    event.type === 'academic' ? 'Academic' : 'Cultural',
                    event.startDate,
                    event.endDate,
                    event.startTime,
                    event.endTime,
                    `"${event.venue}"`,
                    status.charAt(0).toUpperCase() + status.slice(1),
                    `"${event.description || ''}"`,
                    new Date(event.created).toLocaleString(),
                    event.modified ? new Date(event.modified).toLocaleString() : ''
                ].join(',');
                csv += row + '\n';
            });

            // Create download link
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ACT_Events_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }

        // Auto-refresh data every 30s to pick up new/changed events
        setInterval(async function () {
            await loadEvents();
            updateStats();
            renderTable();
        }, 30000);

        // Initialize on page load
        window.onload = function () {
            init();
            Notifications.initUI();
        };