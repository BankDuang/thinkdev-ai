/* ThinkDev AI — App JS */
window.activeProjectId = null;

// Auto-remove toasts after animation
document.addEventListener('htmx:afterSwap', function(evt) {
    document.querySelectorAll('.toast').forEach(function(t) {
        setTimeout(function() { t.remove(); }, 3000);
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        var overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
    }
    // Ctrl+S / Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
    }
});

// Tab key in editor inserts tab character
document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab' && e.target.id === 'code-editor') {
        e.preventDefault();
        var ta = e.target;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + '\t' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 1;
        markUnsaved();
    }
});

// Mark editor as unsaved
function markUnsaved() {
    var status = document.getElementById('editor-status');
    if (status) {
        status.innerHTML = '<span class="status-unsaved">&#9679; Unsaved</span>';
    }
}

// Save file via htmx
function saveFile() {
    var editor = document.getElementById('code-editor');
    if (!editor) return;
    var projectId = editor.dataset.projectId;
    var filePath = editor.dataset.filePath;
    if (!projectId || !filePath) return;

    var formData = new FormData();
    formData.append('path', filePath);
    formData.append('content', editor.value);

    fetch('/files/' + projectId + '/save', {
        method: 'POST',
        body: formData,
    })
    .then(function(r) { return r.text(); })
    .then(function(html) {
        var status = document.getElementById('editor-status');
        if (status) status.innerHTML = html;
    })
    .catch(function() {
        var status = document.getElementById('editor-status');
        if (status) status.innerHTML = '<span class="status-unsaved">&#9679; Save failed</span>';
    });
}

// File tree: create file
function promptCreateFile(projectId, parentPath) {
    var name = prompt('File name:');
    if (!name) return;
    var fullPath = parentPath ? parentPath + name : name;
    var formData = new FormData();
    formData.append('path', fullPath);
    formData.append('is_directory', 'false');
    fetch('/files/' + projectId + '/create', { method: 'POST', body: formData })
        .then(function(r) { return r.text(); })
        .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
}

// File tree: create folder
function promptCreateFolder(projectId, parentPath) {
    var name = prompt('Folder name:');
    if (!name) return;
    var fullPath = parentPath ? parentPath + name : name;
    var formData = new FormData();
    formData.append('path', fullPath);
    formData.append('is_directory', 'true');
    fetch('/files/' + projectId + '/create', { method: 'POST', body: formData })
        .then(function(r) { return r.text(); })
        .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
}

// File tree: rename
function promptRename(projectId, oldPath) {
    var newName = prompt('New name:', oldPath);
    if (!newName || newName === oldPath) return;
    var formData = new FormData();
    formData.append('old_path', oldPath);
    formData.append('new_path', newName);
    fetch('/files/' + projectId + '/rename', { method: 'POST', body: formData })
        .then(function(r) { return r.text(); })
        .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
}

// File tree: delete
function confirmDelete(projectId, path) {
    if (!confirm('Delete "' + path + '"?')) return;
    fetch('/files/' + projectId + '/delete?path=' + encodeURIComponent(path), { method: 'DELETE' })
        .then(function(r) { return r.text(); })
        .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
}

// Highlight active file in tree
document.addEventListener('htmx:afterSwap', function(evt) {
    if (evt.detail.target && evt.detail.target.id === 'editor-area') {
        document.querySelectorAll('.tree-file').forEach(function(el) { el.classList.remove('active'); });
        var editor = document.getElementById('code-editor');
        if (editor) {
            var fp = editor.dataset.filePath;
            document.querySelectorAll('.tree-file').forEach(function(el) {
                if (el.dataset.filepath === fp) el.classList.add('active');
            });
        }
    }
});

// ═══════════════════════════════════════
// Terminal WebSocket Client
// ═══════════════════════════════════════

var terminalWS = null;
var activeTerminalId = null;

function getWSUrl(sessionId) {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws/terminal/' + sessionId;
}

function connectTerminal(sessionId) {
    // Disconnect existing
    disconnectTerminal();

    activeTerminalId = sessionId;
    var screen = document.getElementById('terminal-screen');
    if (!screen) return;
    screen.textContent = '';

    var url = getWSUrl(sessionId);
    terminalWS = new WebSocket(url);

    terminalWS.binaryType = 'arraybuffer';

    terminalWS.onopen = function() {
        // Focus input
        var input = document.getElementById('terminal-input');
        if (input) input.focus();
    };

    terminalWS.onmessage = function(evt) {
        var screen = document.getElementById('terminal-screen');
        if (!screen) return;
        var text;
        if (evt.data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(evt.data);
        } else {
            text = evt.data;
        }
        // Strip some problematic ANSI sequences but keep basic ones
        screen.textContent += text;
        // Auto-scroll
        var output = document.getElementById('terminal-output');
        if (output) output.scrollTop = output.scrollHeight;
    };

    terminalWS.onclose = function() {
        var screen = document.getElementById('terminal-screen');
        if (screen && activeTerminalId === sessionId) {
            screen.textContent += '\r\n[Disconnected]\r\n';
        }
        if (activeTerminalId === sessionId) {
            terminalWS = null;
        }
    };

    terminalWS.onerror = function() {
        var screen = document.getElementById('terminal-screen');
        if (screen) screen.textContent += '\r\n[Connection error]\r\n';
    };
}

function disconnectTerminal() {
    if (terminalWS) {
        try { terminalWS.close(); } catch(e) {}
        terminalWS = null;
    }
}

function autoConnectActiveTerminal() {
    // Find the active terminal tab in the DOM and connect its WS
    setTimeout(function() {
        var activeTab = document.querySelector('.terminal-tab.active');
        if (activeTab && activeTab.dataset.sessionId) {
            connectTerminal(activeTab.dataset.sessionId);
        }
    }, 150);
}

function handleTerminalInput(event) {
    var input = document.getElementById('terminal-input');
    if (!input) return;

    // Ctrl+key combos — send control characters
    if (event.ctrlKey && !event.metaKey && !event.altKey) {
        var ctrlMap = {
            'c': '\x03', 'd': '\x04', 'z': '\x1a', 'l': '\x0c',
            'a': '\x01', 'e': '\x05', 'u': '\x15', 'k': '\x0b',
            'w': '\x17', 'r': '\x12'
        };
        var ch = ctrlMap[event.key.toLowerCase()];
        if (ch) {
            event.preventDefault();
            sendToTerminal(ch);
            return;
        }
    }

    // Arrow keys
    var arrowMap = {
        'ArrowUp': '\x1b[A', 'ArrowDown': '\x1b[B',
        'ArrowRight': '\x1b[C', 'ArrowLeft': '\x1b[D'
    };
    if (arrowMap[event.key]) {
        event.preventDefault();
        sendToTerminal(arrowMap[event.key]);
        return;
    }

    // Enter — send command
    if (event.key === 'Enter') {
        event.preventDefault();
        var cmd = input.value + '\n';
        sendToTerminal(cmd);
        input.value = '';
    }

    // Tab — send tab character
    if (event.key === 'Tab') {
        event.preventDefault();
        sendToTerminal('\t');
    }
}

function sendToTerminal(data) {
    if (!terminalWS || terminalWS.readyState !== WebSocket.OPEN) {
        console.warn('Terminal WS not connected, state:', terminalWS ? terminalWS.readyState : 'null');
        return;
    }
    terminalWS.send(data);
}

function createTerminal() {
    var projectId = window.activeProjectId;
    if (!projectId) return;
    var formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('name', 'bash');
    fetch('/terminal/create', { method: 'POST', body: formData })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var container = document.getElementById('terminal-container');
            if (container) { container.innerHTML = html; htmx.process(container); }
            autoConnectActiveTerminal();
        });
}

function switchTerminalTab(sessionId) {
    // Update tab UI
    document.querySelectorAll('.terminal-tab').forEach(function(t) {
        t.classList.remove('active');
        if (t.dataset.sessionId === sessionId) t.classList.add('active');
    });
    // Reconnect WebSocket
    connectTerminal(sessionId);
}

function closeTerminalTab(sessionId) {
    disconnectTerminal();
    fetch('/terminal/' + sessionId, { method: 'DELETE' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var container = document.getElementById('terminal-container');
            if (container) { container.innerHTML = html; htmx.process(container); }
            autoConnectActiveTerminal();
        });
}

function clearTerminal(sessionId) {
    fetch('/terminal/' + sessionId + '/clear', { method: 'POST' });
    var screen = document.getElementById('terminal-screen');
    if (screen) screen.textContent = '';
}

// ═══════════════════════════════════════
// Panel Resize
// ═══════════════════════════════════════

(function() {
    var layout = document.querySelector('.app-layout');
    if (!layout) return;

    // Bottom panel resize (vertical)
    var bottomPanel = document.querySelector('.panel-bottom');
    if (bottomPanel) {
        var vHandle = document.createElement('div');
        vHandle.className = 'resize-handle-v';
        bottomPanel.parentNode.insertBefore(vHandle, bottomPanel);

        var startY, startH;
        vHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            startY = e.clientY;
            startH = bottomPanel.offsetHeight;
            vHandle.classList.add('active');
            document.addEventListener('mousemove', onVMove);
            document.addEventListener('mouseup', onVUp);
        });
        function onVMove(e) {
            var delta = startY - e.clientY;
            var newH = Math.max(100, Math.min(startH + delta, window.innerHeight - 200));
            layout.style.gridTemplateRows = '1fr ' + newH + 'px';
        }
        function onVUp() {
            vHandle.classList.remove('active');
            document.removeEventListener('mousemove', onVMove);
            document.removeEventListener('mouseup', onVUp);
        }
    }
})();

// ═══════════════════════════════════════
// Right-Click Context Menu for File Tree
// ═══════════════════════════════════════

(function() {
    document.addEventListener('contextmenu', function(e) {
        var treeItem = e.target.closest('.tree-item');
        if (!treeItem) return;
        e.preventDefault();
        closeContextMenu();

        var isFile = treeItem.classList.contains('tree-file');
        var filePath = treeItem.dataset ? treeItem.dataset.filepath : null;
        var projectId = window.activeProjectId;
        if (!projectId) return;

        // For folders, get path from the parent tree-dir
        if (!filePath) {
            var parentDir = treeItem.closest('.tree-dir');
            if (parentDir) {
                var folderItem = parentDir.querySelector('.tree-folder');
                // Try to extract path from onclick
            }
        }

        var menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';

        if (isFile && filePath) {
            menu.innerHTML =
                '<div class="context-menu-item" onclick="closeContextMenu();" ' +
                    'hx-get="/files/' + projectId + '/read?path=' + encodeURIComponent(filePath) + '" ' +
                    'hx-target="#editor-area" hx-swap="innerHTML">Open</div>' +
                '<div class="context-menu-separator"></div>' +
                '<div class="context-menu-item" onclick="closeContextMenu(); promptRename(\'' + projectId + '\', \'' + filePath + '\')">Rename</div>' +
                '<div class="context-menu-item danger" onclick="closeContextMenu(); confirmDelete(\'' + projectId + '\', \'' + filePath + '\')">Delete</div>';
        } else {
            menu.innerHTML =
                '<div class="context-menu-item" onclick="closeContextMenu(); promptCreateFile(\'' + projectId + '\', \'\')">New File</div>' +
                '<div class="context-menu-item" onclick="closeContextMenu(); promptCreateFolder(\'' + projectId + '\', \'\')">New Folder</div>';
        }

        document.body.appendChild(menu);
        // Re-process htmx attributes on dynamically added elements
        if (window.htmx) htmx.process(menu);

        // Adjust if off-screen
        var rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
    });

    document.addEventListener('click', closeContextMenu);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeContextMenu(); });
})();

function closeContextMenu() {
    document.querySelectorAll('.context-menu').forEach(function(m) { m.remove(); });
}

// ═══════════════════════════════════════
// Session Manager (right panel)
// ═══════════════════════════════════════

function refreshSessionManager() {
    var projectId = window.activeProjectId;
    if (!projectId) return;
    fetch('/terminal/sessions/' + projectId)
        .then(function(r) { return r.text(); })
        .then(function(html) {
            // Extract session info for the session panel
            var container = document.getElementById('session-content');
            if (!container) return;
            // Parse sessions from terminal panel response — build simple list
            var tabs = document.querySelectorAll('.terminal-tab');
            var sessionsHtml = '';
            tabs.forEach(function(tab) {
                var sid = tab.dataset.sessionId;
                var name = tab.querySelector('.terminal-tab-name');
                var indicator = tab.querySelector('.terminal-tab-indicator');
                var status = indicator && indicator.classList.contains('running') ? 'running' : 'stopped';
                sessionsHtml += '<div class="session-item">' +
                    '<div class="session-info">' +
                    '<span class="session-dot ' + status + '"></span>' +
                    '<span class="session-name">' + (name ? name.textContent : 'terminal') + '</span>' +
                    '</div>' +
                    '<button class="btn-icon btn-xs" onclick="switchTerminalTab(\'' + sid + '\')" title="Focus">&#9654;</button>' +
                    '</div>';
            });
            container.innerHTML = sessionsHtml || '<div class="empty-state">No active sessions</div>';
        });
}

// Refresh session manager when terminal panel changes
var _origCreateTerminal = createTerminal;
createTerminal = function() {
    _origCreateTerminal();
    setTimeout(refreshSessionManager, 500);
};

var _origCloseTerminalTab = closeTerminalTab;
closeTerminalTab = function(sid) {
    _origCloseTerminalTab(sid);
    setTimeout(refreshSessionManager, 500);
};

// ═══════════════════════════════════════
// AI CLI Quick Launch
// ═══════════════════════════════════════

function launchAICLI(tool) {
    var projectId = window.activeProjectId;
    if (!projectId) return;
    var formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('name', tool);
    fetch('/terminal/create', { method: 'POST', body: formData })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var container = document.getElementById('terminal-container');
            if (container) { container.innerHTML = html; htmx.process(container); }
            autoConnectActiveTerminal();
            // Send the tool command after WS connects
            setTimeout(function() {
                sendToTerminal(tool + '\n');
            }, 500);
            setTimeout(refreshSessionManager, 600);
        });
}

// ═══════════════════════════════════════
// Toast Helper
// ═══════════════════════════════════════

function showToast(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function() { toast.remove(); }, 3000);
}

console.log("ThinkDev AI loaded");
