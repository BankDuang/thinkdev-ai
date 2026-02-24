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

// Line numbers for code editor
function updateLineNumbers() {
    var editor = document.getElementById('code-editor');
    var gutter = document.getElementById('line-numbers');
    if (!editor || !gutter) return;
    var lines = editor.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= lines; i++) {
        html += '<div>' + i + '</div>';
    }
    gutter.innerHTML = html;
    syncLineNumbers();
}

function syncLineNumbers() {
    var editor = document.getElementById('code-editor');
    var gutter = document.getElementById('line-numbers');
    if (!editor || !gutter) return;
    gutter.scrollTop = editor.scrollTop;
}

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
    formData.append('content', window.cmEditor ? window.cmEditor.getValue() : editor.value);

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

// Custom app prompt modal (replaces browser prompt/confirm)
function showAppPrompt(title, placeholder, defaultValue, callback) {
    var container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = '<div class="modal-overlay" onclick="closeAppPrompt()">' +
        '<div class="modal" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><span>' + title + '</span>' +
        '<button class="btn-icon" onclick="closeAppPrompt()">&times;</button></div>' +
        '<div class="modal-body">' +
        '<input type="text" id="app-prompt-input" class="form-input" ' +
        'placeholder="' + (placeholder || '') + '" ' +
        'value="' + (defaultValue || '') + '" ' +
        'onkeydown="if(event.key===\'Enter\')submitAppPrompt()">' +
        '</div>' +
        '<div class="modal-footer">' +
        '<button class="btn" onclick="closeAppPrompt()">Cancel</button>' +
        '<button class="btn btn-primary" onclick="submitAppPrompt()">OK</button>' +
        '</div></div></div>';
    window._appPromptCallback = callback;
    setTimeout(function() {
        var input = document.getElementById('app-prompt-input');
        if (input) { input.focus(); input.select(); }
    }, 50);
}

function showAppConfirm(title, message, callback) {
    var container = document.getElementById('modal-container');
    if (!container) return;
    container.innerHTML = '<div class="modal-overlay" onclick="closeAppPrompt()">' +
        '<div class="modal" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><span>' + title + '</span>' +
        '<button class="btn-icon" onclick="closeAppPrompt()">&times;</button></div>' +
        '<div class="modal-body"><p style="margin:0;color:var(--text-secondary)">' + message + '</p></div>' +
        '<div class="modal-footer">' +
        '<button class="btn" onclick="closeAppPrompt()">Cancel</button>' +
        '<button class="btn btn-danger" onclick="window._appPromptCallback&&window._appPromptCallback();closeAppPrompt()">Delete</button>' +
        '</div></div></div>';
    window._appPromptCallback = callback;
}

function submitAppPrompt() {
    var input = document.getElementById('app-prompt-input');
    var val = input ? input.value.trim() : '';
    if (val && window._appPromptCallback) window._appPromptCallback(val);
    closeAppPrompt();
}

function closeAppPrompt() {
    var container = document.getElementById('modal-container');
    if (container) container.innerHTML = '';
    window._appPromptCallback = null;
}

// File tree: create file
function promptCreateFile(projectId, parentPath) {
    showAppPrompt('New File', 'filename.ext', '', function(name) {
        var fullPath = parentPath ? parentPath + name : name;
        var formData = new FormData();
        formData.append('path', fullPath);
        formData.append('is_directory', 'false');
        fetch('/files/' + projectId + '/create', { method: 'POST', body: formData })
            .then(function(r) { return r.text(); })
            .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
    });
}

// File tree: create folder
function promptCreateFolder(projectId, parentPath) {
    showAppPrompt('New Folder', 'folder-name', '', function(name) {
        var fullPath = parentPath ? parentPath + name : name;
        var formData = new FormData();
        formData.append('path', fullPath);
        formData.append('is_directory', 'true');
        fetch('/files/' + projectId + '/create', { method: 'POST', body: formData })
            .then(function(r) { return r.text(); })
            .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
    });
}

// File tree: rename
function promptRename(projectId, oldPath) {
    showAppPrompt('Rename', 'new-name', oldPath, function(newName) {
        if (newName === oldPath) return;
        var formData = new FormData();
        formData.append('old_path', oldPath);
        formData.append('new_path', newName);
        fetch('/files/' + projectId + '/rename', { method: 'POST', body: formData })
            .then(function(r) { return r.text(); })
            .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
    });
}

// File tree: delete
function confirmDelete(projectId, path) {
    showAppConfirm('Delete', 'Delete "' + path + '"?', function() {
        fetch('/files/' + projectId + '/delete?path=' + encodeURIComponent(path), { method: 'DELETE' })
            .then(function(r) { return r.text(); })
            .then(function(html) { var el = document.getElementById('file-tree'); el.innerHTML = html; htmx.process(el); });
    });
}

// Highlight active file in tree; auto-switch to code panel on mobile
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
        // On mobile, auto-switch to the Code tab when a file is opened
        if (window.innerWidth <= 768) {
            switchMobileTab('code');
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
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Consolas', 'Menlo', monospace",
        lineHeight: 1.4,
        letterSpacing: 0,
        scrollback: 10000,
        scrollOnUserInput: true,
        theme: {
            background:          '#0b0b14',
            foreground:          '#e4e6f4',
            cursor:              '#a5b4fc',
            cursorAccent:        '#0b0b14',
            selectionBackground: '#2a2a46',
            black:               '#22223a',
            red:                 '#f87171',
            green:               '#4ade80',
            yellow:              '#fb923c',
            blue:                '#818cf8',
            magenta:             '#c084fc',
            cyan:                '#67e8f9',
            white:               '#c8cce8',
            brightBlack:         '#30305a',
            brightRed:           '#fca5a5',
            brightGreen:         '#86efac',
            brightYellow:        '#fdba74',
            brightBlue:          '#a5b4fc',
            brightMagenta:       '#d8b4fe',
            brightCyan:          '#a5f3fc',
            brightWhite:         '#e4e6f4'
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
        xterm.write(data, function() { xterm.scrollToBottom(); });
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
    var activeTab = document.querySelector('.terminal-tab.active');
    if (!activeTab || activeTab.dataset.sessionId === sessionId) {
        disconnectTerminal();
    }
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
// Left / Right Panel Resize + Collapse
// ═══════════════════════════════════════

var _leftW = 250;
var _rightW = 260;
var _leftCollapsed = false;
var _rightCollapsed = false;

function _updateColumns() {
    var layout = document.querySelector('.app-layout');
    if (!layout) return;
    var lw = _leftCollapsed ? '0px' : _leftW + 'px';
    var lh = _leftCollapsed ? '0px' : '4px';
    var rw = _rightCollapsed ? '0px' : _rightW + 'px';
    var rh = _rightCollapsed ? '0px' : '4px';
    layout.style.gridTemplateColumns = lw + ' ' + lh + ' 1fr ' + rh + ' ' + rw;
    layout.classList.toggle('left-collapsed', _leftCollapsed);
    layout.classList.toggle('right-collapsed', _rightCollapsed);
}

function toggleLeftPanel() {
    if (window.innerWidth <= 768) return;
    if (!_leftCollapsed) {
        _leftW = document.querySelector('.panel-left').offsetWidth || 250;
    }
    _leftCollapsed = !_leftCollapsed;
    _updateColumns();
}

function toggleRightPanel() {
    if (window.innerWidth <= 768) return;
    if (!_rightCollapsed) {
        _rightW = document.querySelector('.panel-right').offsetWidth || 260;
    }
    _rightCollapsed = !_rightCollapsed;
    _updateColumns();
}

(function() {
    var layout = document.querySelector('.app-layout');
    if (!layout) return;

    // Left handle drag
    var lHandle = document.getElementById('left-resize-handle');
    if (lHandle) {
        var startX, startW;
        lHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            startX = e.clientX;
            startW = document.querySelector('.panel-left').offsetWidth;
            lHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onLMove);
            document.addEventListener('mouseup', onLUp);
        });
        function onLMove(e) {
            var newW = Math.max(120, Math.min(startW + (e.clientX - startX), window.innerWidth / 2));
            _leftW = newW;
            layout.style.gridTemplateColumns = newW + 'px 4px 1fr 4px ' + (_rightCollapsed ? '0px' : _rightW + 'px');
        }
        function onLUp() {
            lHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onLMove);
            document.removeEventListener('mouseup', onLUp);
        }
        lHandle.addEventListener('dblclick', function() { toggleLeftPanel(); });
    }

    // Right handle drag
    var rHandle = document.getElementById('right-resize-handle');
    if (rHandle) {
        var startX2, startW2;
        rHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            startX2 = e.clientX;
            startW2 = document.querySelector('.panel-right').offsetWidth;
            rHandle.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onRMove);
            document.addEventListener('mouseup', onRUp);
        });
        function onRMove(e) {
            var newW = Math.max(120, Math.min(startW2 - (e.clientX - startX2), window.innerWidth / 2));
            _rightW = newW;
            layout.style.gridTemplateColumns = (_leftCollapsed ? '0px' : _leftW + 'px') + ' 4px 1fr 4px ' + newW + 'px';
        }
        function onRUp() {
            rHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onRMove);
            document.removeEventListener('mouseup', onRUp);
        }
        rHandle.addEventListener('dblclick', function() { toggleRightPanel(); });
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

// ═══════════════════════════════════════
// Git Operations — in-app confirm modal
// ═══════════════════════════════════════

function confirmGitOp(action, projectId, message) {
    var container = document.getElementById('modal-container');
    if (!container) return;
    var actionLabel = action === 'pull' ? 'Pull' : 'Push';
    var btnClass = action === 'push' ? 'btn-primary' : 'btn-secondary';
    container.innerHTML = '<div class="modal-overlay" onclick="closeAppPrompt()">' +
        '<div class="modal" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><span>Git ' + actionLabel + '</span>' +
        '<button class="btn-icon" onclick="closeAppPrompt()">&times;</button></div>' +
        '<div class="modal-body"><p style="margin:0;color:var(--text-secondary)">' + message + '</p></div>' +
        '<div class="modal-footer">' +
        '<button class="btn btn-secondary" onclick="closeAppPrompt()">Cancel</button>' +
        '<button class="btn ' + btnClass + '" onclick="executeGitOp(\'' + action + '\', \'' + projectId + '\')">' + actionLabel + '</button>' +
        '</div></div></div>';
}

function executeGitOp(action, projectId) {
    closeAppPrompt();
    showToast('Git ' + action + ' in progress…', 'info');
    fetch('/git/' + projectId + '/' + action, { method: 'POST' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var el = document.getElementById('git-content');
            if (el) { el.innerHTML = html; if (window.htmx) htmx.process(el); }
        })
        .catch(function() {
            showToast('Git ' + action + ' failed', 'error');
        });
}

function gitPull() {
    var pid = window.activeProjectId;
    if (!pid) { showToast('No project selected', 'error'); return; }
    confirmGitOp('pull', pid, 'Pull from remote?');
}

function gitPush() {
    var pid = window.activeProjectId;
    if (!pid) { showToast('No project selected', 'error'); return; }
    confirmGitOp('push', pid, 'Push to remote?');
}

function gitFetch() {
    var pid = window.activeProjectId;
    if (!pid) { showToast('No project selected', 'error'); return; }
    showToast('Fetching…', 'info');
    fetch('/git/' + pid + '/fetch', { method: 'POST' })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var el = document.getElementById('git-content');
            if (el) { el.innerHTML = html; if (window.htmx) htmx.process(el); }
        })
        .catch(function() { showToast('Fetch failed', 'error'); });
}

// Prevent browser from stealing Ctrl+L when terminal is active
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'l' && xterm && terminalWS) {
        e.preventDefault();
    }
});

// ═══════════════════════════════════════
// Mobile Navigation
// ═══════════════════════════════════════

function switchMobileTab(tab) {
    var layout = document.querySelector('.app-layout');
    if (!layout) return;

    // Swap mobile panel class — make the target panel visible FIRST
    layout.classList.remove('mobile-projects', 'mobile-code', 'mobile-git', 'mobile-terminal');
    layout.classList.add('mobile-' + tab);

    // Toggle body class for terminal ctrl bar
    document.body.classList.toggle('mobile-terminal-active', tab === 'terminal');

    // Clear any inline grid styles that desktop JS may have set
    layout.style.gridTemplateColumns = '';
    layout.style.gridTemplateRows = '';
    layout.classList.remove('left-collapsed', 'right-collapsed');

    // Highlight active nav button
    document.querySelectorAll('.mobile-nav-item').forEach(function(b) { b.classList.remove('active'); });
    var btn = document.getElementById('mnav-' + tab);
    if (btn) btn.classList.add('active');

    if (tab === 'terminal') {
        // Auto-create a terminal if a project is active but none exists yet
        if (window.activeProjectId && !document.querySelector('.terminal-tab')) {
            // Panel is now visible; create terminal and refit after fetch completes
            createTerminalMobile();
        } else {
            // Terminal already exists — just refit after the panel becomes visible
            _refitXtermDelayed();
        }
    }

    if (tab === 'code') {
        // Refresh CodeMirror editor size after panel becomes visible
        setTimeout(function() {
            if (window.cmEditor) try { window.cmEditor.refresh(); } catch(e) {}
        }, 80);
    }
}

// Mobile-specific terminal creation: waits for fetch to complete, then connects + fits
function createTerminalMobile() {
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
            // Now the DOM has the terminal-xterm div and the panel is visible
            // Wait a frame for layout to settle, then connect
            requestAnimationFrame(function() {
                autoConnectActiveTerminal();
                // Refit after connection establishes
                _refitXtermDelayed();
            });
        });
}

// Delayed refit helper: tries multiple times to ensure xterm gets proper dimensions
function _refitXtermDelayed() {
    // Use multiple retries because mobile browsers can be slow to reflow
    [50, 200, 600].forEach(function(delay) {
        setTimeout(function() {
            _mobileFixTerminalHeight();
            if (xtermFitAddon) try { xtermFitAddon.fit(); } catch(e) {}
            if (xterm) { xterm.scrollToBottom(); xterm.focus(); }
        }, delay);
    });
}

// On mobile, set an explicit pixel height on the terminal container
// so xterm fit addon calculates the correct number of rows.
function _mobileFixTerminalHeight() {
    if (window.innerWidth > 768) return;
    var xtermEl = document.getElementById('terminal-xterm');
    var output = document.getElementById('terminal-output');
    if (!xtermEl || !output) return;
    // Measure available height: output element's clientHeight
    // Reset any previous fixed height first so output can flex naturally
    xtermEl.style.height = '';
    var h = output.clientHeight;
    if (h > 0) {
        xtermEl.style.height = h + 'px';
    }
}

// Sync layout classes on resize
window.addEventListener('resize', function() {
    var layout = document.querySelector('.app-layout');
    if (!layout) return;
    if (window.innerWidth > 768) {
        // Switching to desktop: remove mobile tab classes
        layout.classList.remove('mobile-projects', 'mobile-code', 'mobile-git', 'mobile-terminal');
        if (xtermFitAddon) try { xtermFitAddon.fit(); } catch(e) {}
    } else {
        // Switching to mobile: remove desktop collapsed classes so they don't hide panels
        layout.classList.remove('left-collapsed', 'right-collapsed');
    }
});

// Init mobile on page load
(function() {
    if (window.innerWidth <= 768) {
        var layout = document.querySelector('.app-layout');
        if (layout) layout.classList.remove('left-collapsed', 'right-collapsed');
        switchMobileTab('projects');
    }
})();

console.log("ThinkDev AI loaded");
