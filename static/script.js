const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const seedInput = document.getElementById('seed-url');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const logsContainer = document.getElementById('logs-container');
const resultsTableBody = document.querySelector('#results-table tbody');
const resultCount = document.getElementById('result-count');

let pollingInterval = null;

async function startCrawl() {
    const url = seedInput.value;
    if (!url) return alert("Please enter a URL");

    try {
        const response = await fetch('/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await response.json();

        if (data.status === 'started') {
            setRunningState(true);
            startPolling();
        } else {
            alert(data.message);
        }
    } catch (e) {
        console.error(e);
        alert("Failed to start crawler");
    }
}

async function stopCrawl() {
    try {
        await fetch('/stop', { method: 'POST' });
        setRunningState(false);
        stopPolling();
    } catch (e) {
        console.error(e);
    }
}

function setRunningState(isRunning) {
    if (isRunning) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusDot.classList.add('running');
        statusText.textContent = "Operation Active";
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusDot.classList.remove('running');
        statusText.textContent = "Ready";
    }
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(fetchStatus, 2000);
}

function stopPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
}

async function fetchStatus() {
    try {
        const response = await fetch('/status');
        const status = await response.json();

        // Update logs
        logsContainer.innerHTML = '';
        status.logs.forEach(log => {
            const div = document.createElement('div');
            div.className = 'log-entry';
            div.textContent = `[${log.time}] ${log.message}`;
            logsContainer.appendChild(div);
        });
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // Sync state if it stopped automatically
        if (status.is_running) {
            setRunningState(true);
        } else if (!status.is_running && startBtn.disabled) {
            setRunningState(false);
            stopPolling();
        }

        // Fetch results
        fetchResults();

    } catch (e) {
        console.error(e);
    }
}

async function fetchResults() {
    try {
        const response = await fetch('/results');
        const data = await response.json();

        resultCount.textContent = data.length;
        resultsTableBody.innerHTML = '';

        data.reverse().forEach(item => {
            const row = document.createElement('tr');

            const emailsHtml = item.emails.length > 0
                ? item.emails.map(e => `<span class="email-tag">${e}</span>`).join('')
                : '<span style="color:var(--text-secondary)">No emails</span>';

            // Format timestamp
            const time = new Date(item.timestamp).toLocaleTimeString();

            row.innerHTML = `
                <td><a href="${item.url}" target="_blank" style="color:var(--text-primary); text-decoration:none">${item.url}</a></td>
                <td>${emailsHtml}</td>
                <td>${time}</td>
                <td><a href="#" onclick="alert('Screenshot saved at: ${item.screenshot}')" class="view-link">View File</a></td>
            `;
            resultsTableBody.appendChild(row);
        });
    } catch (e) {
        console.error(e);
    }
}

// Initialize state on load
fetchStatus();
startPolling();
