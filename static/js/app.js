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
// Terminal — xterm.js + WebSocket
// ═══════════════════════════════════════

var terminalWS = null;
var activeTerminalId = null;
var xterm = null;
var xtermFitAddon = null;

function getWSUrl(sessionId) {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/ws/terminal/' + sessionId;
}

function connectTerminal(sessionId) {
    disconnectTerminal();
    activeTerminalId = sessionId;

    var container = document.getElementById('terminal-xterm');
    if (!container) return;
    container.innerHTML = '';

    // Create xterm.js instance
    xterm = new Terminal({
        cursorBlink: true,
        cursorStyle: 'bar',
        fontSize: 13,
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', 'Menlo', monospace",
        lineHeight: 1.2,
        scrollback: 10000,
        scrollOnUserInput: true,
        theme: {
            background: '#11111b',
            foreground: '#cdd6f4',
            cursor: '#f5e0dc',
            selectionBackground: '#585b70',
            black: '#45475a',
            red: '#f38ba8',
            green: '#a6e3a1',
            yellow: '#f9e2af',
            blue: '#89b4fa',
            magenta: '#f5c2e7',
            cyan: '#94e2d5',
            white: '#bac2de',
            brightBlack: '#585b70',
            brightRed: '#f38ba8',
            brightGreen: '#a6e3a1',
            brightYellow: '#f9e2af',
            brightBlue: '#89b4fa',
            brightMagenta: '#f5c2e7',
            brightCyan: '#94e2d5',
            brightWhite: '#a6adc8'
        }
    });

    xtermFitAddon = new FitAddon.FitAddon();
    xterm.loadAddon(xtermFitAddon);
    xterm.open(container);

    // Fit to container size
    try { xtermFitAddon.fit(); } catch(e) {}

    // Connect WebSocket
    var url = getWSUrl(sessionId);
    terminalWS = new WebSocket(url);
    terminalWS.binaryType = 'arraybuffer';

    terminalWS.onopen = function() {
        xterm.focus();
        // Send terminal size to server
        sendTerminalResize();
    };

    terminalWS.onmessage = function(evt) {
        if (!xterm) return;
        var data;
        if (evt.data instanceof ArrayBuffer) {
            data = new TextDecoder().decode(evt.data);
        } else {
            data = evt.data;
        }
        xterm.write(data);
    };

    terminalWS.onclose = function() {
        if (xterm && activeTerminalId === sessionId) {
            xterm.write('\r\n\x1b[90m[Disconnected]\x1b[0m\r\n');
        }
        if (activeTerminalId === sessionId) {
            terminalWS = null;
        }
    };

    terminalWS.onerror = function() {
        if (xterm) xterm.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
    };

    // Intercept Ctrl key combos so browser doesn't steal them
    xterm.attachCustomKeyEventHandler(function(e) {
        if (e.ctrlKey && !e.metaKey && !e.altKey && e.type === 'keydown') {
            var key = e.key.toLowerCase();
            // Let xterm handle these Ctrl combos (clear, interrupt, etc.)
            if ('cldzauekw'.indexOf(key) !== -1) {
                e.preventDefault();
                return true;
            }
        }
        return true;
    });

    // Send keystrokes from xterm to WS
    xterm.onData(function(data) {
        if (terminalWS && terminalWS.readyState === WebSocket.OPEN) {
            terminalWS.send(data);
        }
    });

    // Handle resize
    xterm.onResize(function(size) {
        sendTerminalResize();
    });

    // Observe container resize
    if (window._xtermResizeObserver) window._xtermResizeObserver.disconnect();
    window._xtermResizeObserver = new ResizeObserver(function() {
        if (xtermFitAddon) try { xtermFitAddon.fit(); } catch(e) {}
    });
    window._xtermResizeObserver.observe(container);
}

function sendTerminalResize() {
    if (!xterm || !terminalWS || terminalWS.readyState !== WebSocket.OPEN) return;
    // Send resize as a special message (JSON)
    try {
        terminalWS.send(JSON.stringify({
            type: 'resize',
            cols: xterm.cols,
            rows: xterm.rows
        }));
    } catch(e) {}
}

function disconnectTerminal() {
    if (window._xtermResizeObserver) {
        window._xtermResizeObserver.disconnect();
        window._xtermResizeObserver = null;
    }
    if (xterm) {
        xterm.dispose();
        xterm = null;
        xtermFitAddon = null;
    }
    if (terminalWS) {
        try { terminalWS.close(); } catch(e) {}
        terminalWS = null;
    }
}

function autoConnectActiveTerminal() {
    setTimeout(function() {
        var activeTab = document.querySelector('.terminal-tab.active');
        if (activeTab && activeTab.dataset.sessionId) {
            connectTerminal(activeTab.dataset.sessionId);
        }
    }, 150);
}

function sendToTerminal(data) {
    if (!terminalWS || terminalWS.readyState !== WebSocket.OPEN) return;
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
    if (xterm) xterm.clear();
}

// ═══════════════════════════════════════
// Panel Resize + Minimize / Maximize
// ═══════════════════════════════════════

var _terminalState = 'normal'; // 'normal', 'minimized', 'maximized'
var _terminalSavedH = null;

function _refitXterm() {
    if (xtermFitAddon) {
        setTimeout(function() { try { xtermFitAddon.fit(); } catch(e) {} }, 50);
    }
}

function _setTerminalHeight(h) {
    var layout = document.querySelector('.app-layout');
    if (layout) layout.style.gridTemplateRows = '1fr 4px ' + h + 'px';
    _refitXterm();
}

function toggleTerminalMinimize() {
    var panel = document.querySelector('.panel-bottom');
    if (!panel) return;

    if (_terminalState === 'minimized') {
        // Restore
        panel.classList.remove('minimized');
        _setTerminalHeight(_terminalSavedH || 260);
        _terminalState = 'normal';
    } else {
        // Save current height and minimize
        if (_terminalState === 'maximized') {
            panel.classList.remove('maximized');
        }
        _terminalSavedH = panel.offsetHeight;
        panel.classList.add('minimized');
        _setTerminalHeight(34);
        _terminalState = 'minimized';
    }
}

function toggleTerminalMaximize() {
    var panel = document.querySelector('.panel-bottom');
    if (!panel) return;

    if (_terminalState === 'maximized') {
        // Restore
        panel.classList.remove('maximized');
        _setTerminalHeight(_terminalSavedH || 260);
        _terminalState = 'normal';
    } else {
        // Save current height and maximize
        if (_terminalState === 'minimized') {
            panel.classList.remove('minimized');
        }
        if (_terminalState === 'normal') {
            _terminalSavedH = panel.offsetHeight;
        }
        panel.classList.add('maximized');
        var maxH = window.innerHeight - 80;
        _setTerminalHeight(maxH);
        _terminalState = 'maximized';
    }
}

(function() {
    var layout = document.querySelector('.app-layout');
    var vHandle = document.getElementById('terminal-resize-handle');
    var bottomPanel = document.querySelector('.panel-bottom');
    if (!layout || !vHandle || !bottomPanel) return;

    var startY, startH;
    vHandle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        if (_terminalState !== 'normal') {
            bottomPanel.classList.remove('minimized', 'maximized');
            _terminalState = 'normal';
        }
        startY = e.clientY;
        startH = bottomPanel.offsetHeight;
        vHandle.classList.add('active');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onVMove);
        document.addEventListener('mouseup', onVUp);
    });
    function onVMove(e) {
        var delta = startY - e.clientY;
        var newH = Math.max(34, Math.min(startH + delta, window.innerHeight - 100));
        layout.style.gridTemplateRows = '1fr 4px ' + newH + 'px';
    }
    function onVUp() {
        vHandle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onVMove);
        document.removeEventListener('mouseup', onVUp);
        _refitXterm();
    }

    vHandle.addEventListener('dblclick', function() {
        toggleTerminalMinimize();
    });
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
