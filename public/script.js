const loginScreen = document.getElementById('login-screen');
const panelScreen = document.getElementById('panel-screen');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnRefresh = document.getElementById('btn-refresh');
const loginMessage = document.getElementById('login-message');
const panelMessage = document.getElementById('panel-message');
const userInfo = document.getElementById('user-info');
const connectionsList = document.getElementById('connections-list');
const tablesPanel = document.getElementById('tables-panel');
const tablesList = document.getElementById('tables-list');
const recordsPanel = document.getElementById('records-panel');
const recordsList = document.getElementById('records-list');
const btnNewRecord = document.getElementById('btn-new-record');

let selectedConnectionId = null;
let selectedTableName = null;
let currentTableRecords = [];

const API_PREFIX = '/api';

function setToken(token) {
  localStorage.setItem('portalToken', token);
}

function getToken() {
  return localStorage.getItem('portalToken');
}

function clearToken() {
  localStorage.removeItem('portalToken');
}

function showLogin() {
  loginScreen.classList.remove('hidden');
  panelScreen.classList.add('hidden');
  loginMessage.textContent = '';
  panelMessage.textContent = '';
}

function showPanel() {
  loginScreen.classList.add('hidden');
  panelScreen.classList.remove('hidden');
  const token = getToken();
  if (token) {
    userInfo.textContent = 'Token guardado, listo para usar la API.';
  } else {
    userInfo.textContent = '';
  }
}

async function callApi(path, options = {}) {
  const token = getToken();

  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, options);
  if (!response.ok) {
    const responseBody = await response.json().catch(() => ({}));
    const error = responseBody.error || responseBody.message || response.statusText;
    throw new Error(error);
  }
  return response.json();
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    loginMessage.textContent = 'Debes completar email y contraseña.';
    return;
  }

  loginMessage.textContent = 'Iniciando sesión...';

  try {
    const data = await callApi(`${API_PREFIX}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    setToken(data.token);
    loginMessage.textContent = 'Login exitoso.';
    showPanel();
    await loadConnections();
  } catch (error) {
    loginMessage.textContent = `Error: ${error.message}`;
  }
}

async function loadConnections() {
  panelMessage.textContent = 'Cargando conexiones...';
  try {
    const results = await callApi(`${API_PREFIX}/connections`, { method: 'GET' });

    if (!Array.isArray(results)) {
      throw new Error('Respuesta inesperada de la API');
    }

    if (results.length === 0) {
      connectionsList.innerHTML = '<p>No hay conexiones registradas.</p>';
      panelMessage.textContent = '';
      tablesPanel.classList.add('hidden');
      tablesList.innerHTML = '';
      return;
    }

    const tableRows = results.map((item) => {
      return `<tr data-connection-id="${item.id}"><td>${item.id}</td><td>${item.name}</td><td>${item.host}</td><td>${item.port}</td><td>${item.user}</td><td>${item.database_name}</td></tr>`;
    }).join('');

    connectionsList.innerHTML = `
      <table>
        <thead>
          <tr><th>ID</th><th>Nombre</th><th>Host</th><th>Puerto</th><th>User</th><th>Base</th></tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    `;

    // Agregar click event en filas
    document.querySelectorAll('#connections-list table tbody tr').forEach((row) => {
      row.addEventListener('click', () => {
        const connectionId = row.getAttribute('data-connection-id');
        if (connectionId) {
          loadConnectionTables(connectionId);
        }
      });
    });

    panelMessage.textContent = '';
  } catch (error) {
    panelMessage.textContent = `Error al cargar conexiones: ${error.message}`;
    connectionsList.innerHTML = '';
  }
}

function handleLogout() {
  clearToken();
  selectedConnectionId = null;
  selectedTableName = null;
  currentTableRecords = [];
  showLogin();
  connectionsList.innerHTML = '';
  tablesPanel.classList.add('hidden');
  tablesList.innerHTML = '';
  recordsPanel.classList.add('hidden');
  recordsList.innerHTML = '';
  loginMessage.textContent = 'Sesión cerrada.';
}

async function loadConnectionTables(connectionId) {
  tablesPanel.classList.remove('hidden');
  tablesList.innerHTML = '<p>Cargando tablas...</p>';

  try {
    const data = await callApi(`${API_PREFIX}/connections/query/${connectionId}`, { method: 'GET' });

    if (!data || !Array.isArray(data.tables)) {
      tablesList.innerHTML = '<p>Respuesta inesperada.</p>';
      return;
    }

    const listHtml = data.tables.length
      ? `<ul>${data.tables.map((table) => `<li data-table-name="${table}">${table}</li>`).join('')}</ul>`
      : '<p>No hay tablas.</p>';

    tablesList.innerHTML = listHtml;
    recordsPanel.classList.add('hidden');
    recordsList.innerHTML = '';

    document.querySelectorAll('#tables-list ul li').forEach((li) => {
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        const tableName = li.getAttribute('data-table-name');
        if (tableName) {
          loadTableRecords(connectionId, tableName);
        }
      });
    });

    panelMessage.textContent = '';
  } catch (error) {
    tablesList.innerHTML = `<p>Error: ${error.message}</p>`;
    panelMessage.textContent = `Error al cargar tablas: ${error.message}`;
  }
}

async function loadTableRecords(connectionId, tableName) {
  recordsPanel.classList.remove('hidden');
  recordsList.innerHTML = '<p>Cargando registros...</p>';

  try {
    const data = await callApi(`${API_PREFIX}/connections/table/${connectionId}/${encodeURIComponent(tableName)}`, { method: 'GET' });

    if (!data || !Array.isArray(data.data)) {
      recordsList.innerHTML = '<p>Respuesta inesperada.</p>';
      return;
    }

    if (data.data.length === 0) {
      recordsList.innerHTML = '<p>No hay registros en esta tabla.</p>';
      return;
    }

    currentTableRecords = data.data;
    selectedConnectionId = connectionId;
    selectedTableName = tableName;

    const headerKeys = Object.keys(data.data[0] || {}).filter((key) => key.toLowerCase() !== 'password');
    const headerRow = `${headerKeys.map((key) => `<th>${key}</th>`).join('')}<th>Acciones</th>`;
    const bodyRows = data.data.map((row) => {
      const rowCells = headerKeys.map((key) => `<td>${row[key] !== null && row[key] !== undefined ? row[key] : ''}</td>`).join('');
      const rowId = row.id !== undefined ? row.id : '';
      const actions = `
        <td>
          <button class="btn-action-edit" data-record-id="${rowId}">Editar</button>
          <button class="btn-action-delete" data-record-id="${rowId}">Eliminar</button>
        </td>
      `;
      return `<tr>${rowCells}${actions}</tr>`;
    }).join('');

    recordsList.innerHTML = `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;

    // Eventos CRUD en filas
    document.querySelectorAll('#records-list .btn-action-edit').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const recordId = btn.getAttribute('data-record-id');
        if (recordId) {
          editRecord(recordId);
        }
      });
    });

    document.querySelectorAll('#records-list .btn-action-delete').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const recordId = btn.getAttribute('data-record-id');
        if (recordId) {
          deleteRecord(recordId);
        }
      });
    });

    panelMessage.textContent = '';
  } catch (error) {
    recordsList.innerHTML = `<p>Error: ${error.message}</p>`;
    panelMessage.textContent = `Error al cargar registros: ${error.message}`;
  }
}

async function createRecord() {
  if (!selectedConnectionId || !selectedTableName) {
    return;
  }

  const recordText = prompt('Ingresá los campos del nuevo registro como JSON (por ejemplo {"name":"Jose","age":30})');
  if (!recordText) {
    return;
  }

  try {
    const recordData = JSON.parse(recordText);
    await callApi(`${API_PREFIX}/connections/insert/${selectedConnectionId}/${encodeURIComponent(selectedTableName)}`, {
      method: 'POST',
      body: JSON.stringify(recordData),
    });

    panelMessage.textContent = 'Registro creado correctamente';
    await loadTableRecords(selectedConnectionId, selectedTableName);
  } catch (error) {
    panelMessage.textContent = `Error al crear registro: ${error.message}`;
  }
}

async function editRecord(recordId) {
  if (!selectedConnectionId || !selectedTableName) {
    return;
  }

  const row = currentTableRecords.find((r) => `${r.id}` === `${recordId}`);
  if (!row) {
    panelMessage.textContent = 'No se encontró el registro para editar';
    return;
  }

  const prefill = JSON.stringify(row, null, 2);
  const recordText = prompt('Editá los campos (JSON):', prefill);
  if (!recordText) {
    return;
  }

  try {
    const recordData = JSON.parse(recordText);
    await callApi(`${API_PREFIX}/connections/update/${selectedConnectionId}/${encodeURIComponent(selectedTableName)}/${recordId}`, {
      method: 'PUT',
      body: JSON.stringify(recordData),
    });

    panelMessage.textContent = 'Registro actualizado correctamente';
    await loadTableRecords(selectedConnectionId, selectedTableName);
  } catch (error) {
    panelMessage.textContent = `Error al editar registro: ${error.message}`;
  }
}

async function deleteRecord(recordId) {
  if (!selectedConnectionId || !selectedTableName) {
    return;
  }

  const confirmDelete = confirm('¿Estás seguro de eliminar el registro con id ' + recordId + '?');
  if (!confirmDelete) {
    return;
  }

  try {
    await callApi(`${API_PREFIX}/connections/delete/${selectedConnectionId}/${encodeURIComponent(selectedTableName)}/${recordId}`, {
      method: 'DELETE',
    });

    panelMessage.textContent = 'Registro eliminado correctamente';
    await loadTableRecords(selectedConnectionId, selectedTableName);
  } catch (error) {
    panelMessage.textContent = `Error al eliminar registro: ${error.message}`;
  }
}

btnLogin.addEventListener('click', handleLogin);
btnRefresh.addEventListener('click', loadConnections);
btnLogout.addEventListener('click', handleLogout);
btnNewRecord.addEventListener('click', createRecord);

(function init() {
  const token = getToken();
  if (token) {
    showPanel();
    loadConnections();
  } else {
    showLogin();
  }
})();