const API_PREFIX = '/api';

const userInfo = document.getElementById('user-info');
const panelMessage = document.getElementById('panel-message');
const connectionsList = document.getElementById('connections-list');
const tablesSection = document.getElementById('tables-section');
const chartsSection = document.getElementById('charts-overview');
const pieCanvas = document.getElementById('pie-chart');
const barCanvas = document.getElementById('bar-chart');
const tablesList = document.getElementById('tables-list');
const recordsSection = document.getElementById('records-section');
const recordsList = document.getElementById('records-list');
const formRecord = document.getElementById('form-record');
const formFields = document.getElementById('form-fields');
const formTitle = document.getElementById('form-title');
const formRecordCard = document.getElementById('form-record');
const btnNewConnection = document.getElementById('btn-new-connection');
const newConnectionForm = document.getElementById('new-connection-form');
const connectionForm = document.getElementById('connection-form');
const btnCancelConnection = document.getElementById('btn-cancel-connection');
const btnNewRecord = document.getElementById('btn-new-record');
const btnCancel = document.getElementById('btn-cancel');
const btnSave = document.getElementById('btn-save');
const btnLogout = document.getElementById('btn-logout');
const btnRefresh = document.getElementById('btn-refresh');
const btnExportExcel = document.getElementById('btn-export-excel');
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const tabPanels = document.querySelectorAll('.tab-panel');
const activeEngineLabel = document.getElementById('active-engine');
const statConnections = document.getElementById('stat-connections');
const statEngine = document.getElementById('stat-engine');
const statHealth = document.getElementById('stat-health');
const statHealthDetail = document.getElementById('stat-health-detail');
const profileUser = document.getElementById('profile-user');
const profileConnection = document.getElementById('profile-connection');
const decisionTopTable = document.getElementById('decision-top-table');
const decisionTopRows = document.getElementById('decision-top-rows');
const decisionEmptyTables = document.getElementById('decision-empty-tables');
const decisionEmptyDetail = document.getElementById('decision-empty-detail');
const decisionConcentration = document.getElementById('decision-concentration');
const decisionConcentrationDetail = document.getElementById('decision-concentration-detail');
const decisionRecommendations = document.getElementById('decision-recommendations');
const priorityScoreValue = document.getElementById('priority-score-value');
const priorityScoreLabel = document.getElementById('priority-score-label');
const decisionActiveTable = document.getElementById('decision-active-table');
const decisionSyncNote = document.getElementById('decision-sync-note');
const metricsSummary = document.getElementById('metrics-summary');

let token = localStorage.getItem('portalToken');

// Debug: verificar token al cargar
console.log('Token cargado del localStorage:', token);
let selectedConnection = null;
let selectedConnectionName = '';
let selectedTable = null;
let tableColumns = [];
let tableColumnsAll = [];
let mode = 'create';
let editingRecordId = null;
let currentRecords = [];
let latestConnectionStats = null;

const engineLabels = {
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  sqlserver: 'SQL Server',
};

const autoTimestampFields = ['created_at', 'fecha_creacion', 'fecha_de_creacion'];

const switchTab = (tabName) => {
  sidebarTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === tabName);
  });
};

const getEngineLabel = (engine) => engineLabels[String(engine || '').toLowerCase()] || 'Sin conexion';

const formatNumber = (value) => Number(value || 0).toLocaleString('es-GT');

const getDecisionData = (stats) => {
  const perTable = Array.isArray(stats?.perTable) ? stats.perTable : [];
  const tableCount = Number(stats?.tableCount || perTable.length || 0);
  const totalRows = Number(stats?.totalRows || 0);
  const tablesWithRows = Number(stats?.tablesWithRows || perTable.filter((item) => Number(item.rowCount || 0) > 0).length);
  const emptyTables = Math.max(0, tableCount - tablesWithRows);
  const sorted = perTable.slice().sort((a, b) => Number(b.rowCount || 0) - Number(a.rowCount || 0));
  const topTable = sorted[0] || { tableName: '--', rowCount: 0 };
  const topRows = Number(topTable.rowCount || 0);
  const coverage = tableCount > 0 ? Math.round((tablesWithRows / tableCount) * 100) : 0;
  const concentration = totalRows > 0 ? Math.round((topRows / totalRows) * 100) : 0;
  const healthScore = Math.round((coverage * 0.65) + ((100 - Math.min(concentration, 100)) * 0.35));

  return {
    perTable,
    tableCount,
    totalRows,
    tablesWithRows,
    emptyTables,
    topTable,
    topRows,
    coverage,
    concentration,
    healthScore,
  };
};

const renderDecisionDashboard = (stats, activeTableName = null) => {
  const decision = getDecisionData(stats);
  const recommendations = [];

  statHealth.textContent = decision.tableCount > 0 ? `${decision.healthScore}%` : '--';
  statHealthDetail.textContent = decision.tableCount > 0
    ? `${decision.coverage}% de tablas con datos`
    : 'Selecciona una conexion';

  decisionTopTable.textContent = decision.topTable.tableName || '--';
  decisionTopRows.textContent = `${formatNumber(decision.topRows)} registros`;
  decisionEmptyTables.textContent = formatNumber(decision.emptyTables);
  decisionEmptyDetail.textContent = decision.tableCount > 0
    ? `${decision.emptyTables} de ${decision.tableCount} tablas sin registros`
    : 'Sin conexion activa';
  decisionConcentration.textContent = decision.totalRows > 0 ? `${decision.concentration}%` : '--';
  decisionConcentrationDetail.textContent = decision.totalRows > 0
    ? 'Registros concentrados en la tabla principal'
    : 'Distribucion pendiente';

  priorityScoreValue.textContent = decision.tableCount > 0 ? `${decision.healthScore}` : '--';
  priorityScoreLabel.textContent = decision.healthScore >= 75
    ? 'Base saludable'
    : decision.healthScore >= 45
      ? 'Revisar cobertura'
      : 'Requiere atencion';
  decisionActiveTable.textContent = activeTableName ? `Tabla activa: ${activeTableName}` : 'Sin tabla activa';
  decisionSyncNote.textContent = selectedConnectionName ? `Conexion: ${selectedConnectionName}` : 'Sin alertas';

  if (decision.emptyTables > 0) {
    recommendations.push(`Revisar ${decision.emptyTables} tabla(s) vacias; pueden ser pruebas, catalogos incompletos o tablas sin uso.`);
  }

  if (decision.concentration >= 80 && decision.tableCount > 1) {
    recommendations.push(`La tabla ${decision.topTable.tableName} concentra ${decision.concentration}% de los registros; prioriza respaldos y validaciones ahi.`);
  }

  if (decision.totalRows === 0 && decision.tableCount > 0) {
    recommendations.push('La conexion tiene estructura pero no datos; valida carga inicial o ambiente correcto.');
  }

  if (decision.coverage >= 80 && decision.totalRows > 0) {
    recommendations.push('Cobertura estable: la mayoria de tablas tiene datos. Buen punto para exportar reporte o comparar con el otro motor.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Selecciona una tabla o carga datos para generar recomendaciones mas precisas.');
  }

  decisionRecommendations.innerHTML = recommendations
    .map((item) => `<p>${item}</p>`)
    .join('');

  metricsSummary.innerHTML = `
    <article><strong>${decision.coverage}%</strong><span>Cobertura de tablas</span></article>
    <article><strong>${formatNumber(decision.emptyTables)}</strong><span>Tablas vacias</span></article>
    <article><strong>${formatNumber(decision.totalRows)}</strong><span>Registros totales</span></article>
    <article><strong>${decision.topTable.tableName || '--'}</strong><span>Tabla prioritaria</span></article>
  `;
};

const sortRowsById = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  if (!Object.prototype.hasOwnProperty.call(rows[0], 'id')) return rows;
  return rows.slice().sort((a, b) => {
    const aId = Number(a.id);
    const bId = Number(b.id);
    if (Number.isNaN(aId) || Number.isNaN(bId)) {
      return String(a.id).localeCompare(String(b.id));
    }
    return aId - bId;
  });
};

const loadTableColumns = async (connectionId, tableName) => {
  const response = await apiFetch(`${API_PREFIX}/connections/columns/${connectionId}/${encodeURIComponent(tableName)}`, { method: 'GET' });
  if (!response || !Array.isArray(response.columns)) {
    throw new Error('Respuesta inesperada de /columns');
  }

  return response.columns;
};

const setMessage = (text, isError = false) => {
  const cleanText = String(text || '').includes('visualmente') ? 'Conexion eliminada' : text;
  panelMessage.textContent = cleanText;
  panelMessage.style.color = isError ? '#dc2626' : '#16a34a';
};

const apiFetch = async (path, options = {}) => {
  console.log('Haciendo petición a:', path);
  console.log('Token disponible:', !!token);
  if (!token) throw new Error('Token no disponible');
  options.headers = {
    ...options.headers,
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  console.log('Headers enviados:', options.headers);

  const response = await fetch(path, options);
  console.log('Respuesta status:', response.status);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.log('Error en respuesta:', body);
    throw new Error(body.error || body.message || response.statusText);
  }
  return body;
};

const getDownloadFileName = (contentDisposition, fallbackName) => {
  if (!contentDisposition) return fallbackName;

  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    return decodeURIComponent(utfMatch[1]);
  }

  const basicMatch = contentDisposition.match(/filename="([^"]+)"/i) || contentDisposition.match(/filename=([^;]+)/i);
  return basicMatch?.[1] ? basicMatch[1].trim() : fallbackName;
};

const exportConnectionToExcel = async () => {
  if (!selectedConnection) {
    setMessage('Selecciona una conexión primero', true);
    return;
  }

  try {
    btnExportExcel.disabled = true;
    setMessage('Generando archivo Excel...', false);

    const response = await fetch(`${API_PREFIX}/connections/export/${selectedConnection}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || errorBody.message || response.statusText);
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const suggestedName = getDownloadFileName(
      response.headers.get('Content-Disposition'),
      `reporte-conexion-${selectedConnection}.xlsx`
    );

    link.href = downloadUrl;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    setMessage('Excel descargado correctamente', false);
  } catch (error) {
    setMessage(`Error al exportar Excel: ${error.message}`, true);
  } finally {
    btnExportExcel.disabled = !selectedConnection;
  }
};

const ensureAuth = () => {
  console.log('Verificando autenticación. Token:', token);
  if (!token) {
    console.log('No hay token, redirigiendo a login');
    window.location.href = '/';
    return false;
  }
  console.log('Token encontrado, usuario autenticado');
  const label = 'Usuario activo';
  userInfo.textContent = label;
  profileUser.textContent = label;
  return true;
};

const resetSelection = () => {
  selectedConnection = null;
  selectedTable = null;
  selectedConnectionName = '';
  tableColumns = [];
  tableColumnsAll = [];
  tablesSection.classList.add('hidden');
  recordsSection.classList.add('hidden');
  recordsList.innerHTML = '';
  tablesList.innerHTML = '';
  formRecordCard.classList.add('hidden');
  formFields.innerHTML = '';
  newConnectionForm.classList.add('hidden');
  chartsSection.classList.add('hidden');
  document.getElementById('connection-overview').classList.add('hidden');
  btnExportExcel.disabled = true;
  activeEngineLabel.textContent = 'Sin conexion';
  statEngine.textContent = '--';
  statHealth.textContent = '--';
  statHealthDetail.textContent = 'Selecciona una conexion';
  profileConnection.textContent = 'Sin conexion';
  decisionTopTable.textContent = '--';
  decisionTopRows.textContent = '0 registros';
  decisionEmptyTables.textContent = '0';
  decisionEmptyDetail.textContent = 'Sin conexion activa';
  decisionConcentration.textContent = '--';
  decisionConcentrationDetail.textContent = 'Distribucion pendiente';
  decisionRecommendations.innerHTML = '<p>Selecciona una conexion para ver recomendaciones.</p>';
  priorityScoreValue.textContent = '--';
  priorityScoreLabel.textContent = 'Sin conexion activa';
  decisionActiveTable.textContent = 'Sin tabla activa';
  decisionSyncNote.textContent = 'Sin alertas';
  metricsSummary.innerHTML = '';
};

const loadConnections = async () => {
  setMessage('Cargando conexiones...', false);
  try {
    const results = await apiFetch(`${API_PREFIX}/connections`, { method: 'GET' });
    if (!Array.isArray(results)) throw new Error('Respuesta inesperada de /connections');

    if (results.length === 0) {
      connectionsList.innerHTML = '<p>No hay conexiones registradas.</p>';
      statConnections.textContent = '0';
      setMessage('No hay conexiones registradas. Crea una desde la pestana Conexiones.', false);
      return;
    }

    const visibleResults = results;
    statConnections.textContent = visibleResults.length;

    if (visibleResults.length === 0) {
      connectionsList.innerHTML = '<p>No hay conexiones registradas.</p>';
      setMessage('No hay conexiones registradas. Crea una desde la pestana Conexiones.', false);
      return;
    }

    const rowsHtml = visibleResults
      .map((conn) => `
        <tr data-id="${conn.id}" data-engine="${conn.engine || 'mysql'}">
          <td>${conn.id}</td>
          <td>${conn.name}</td>
          <td>${conn.host}</td>
          <td>${conn.port}</td>
          <td>${conn.user}</td>
          <td>${conn.database_name}</td>
          <td><span class="engine-pill">${getEngineLabel(conn.engine || 'mysql')}</span></td>
          <td><button class="btn-action-remove" data-id="${conn.id}">Eliminar</button></td>
        </tr>
      `)
      .join('');

    connectionsList.innerHTML = `
      <table>
        <thead><tr><th>ID</th><th>Nombre</th><th>Host</th><th>Puerto</th><th>User</th><th>BD</th><th>Engine</th><th>Acción</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    document.querySelectorAll('#connections-list tbody tr').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.classList.contains('btn-action-remove')) return;
        const id = row.getAttribute('data-id');
        const engine = row.getAttribute('data-engine');
        const name = row.children[1]?.textContent || '';
        selectedConnection = id;
        selectedConnectionName = name;
        btnExportExcel.disabled = false;
        activeEngineLabel.textContent = getEngineLabel(engine);
        statEngine.textContent = getEngineLabel(engine);
        profileConnection.textContent = name || `ID ${id}`;
        Array.from(document.querySelectorAll('#connections-list tbody tr')).forEach((r) => r.classList.remove('selected-row'));
        row.classList.add('selected-row');
        loadTables(id);
        switchTab('datos');
      });
    });

    document.querySelectorAll('#connections-list .btn-action-remove').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.stopPropagation();
        const connectionId = button.getAttribute('data-id');
        // La conexion se elimina en el backend; no se oculta solo en pantalla.
        if (!confirm('Confirmar eliminacion de esta conexion?')) {
          return;
        }

        try {
          await apiFetch(`${API_PREFIX}/connections/${connectionId}`, {
            method: 'DELETE',
          });
        } catch (error) {
          setMessage(`Error al eliminar conexion: ${error.message}`, true);
          return;
        }

        const row = button.closest('tr');
        if (row) row.remove();
        if (selectedConnection === connectionId) {
          resetSelection();
        }
        setMessage('Conexion eliminada', false);
        setMessage('Conexión eliminada visualmente. Refresca si quieres recuperarla.', false);
      });
    });

    setMessage('Conexiones cargadas', false);
  } catch (error) {
    setMessage(`Error al cargar conexiones: ${error.message}`, true);
  }
};

const loadTables = async (connectionId) => {
  setMessage('Cargando tablas...', false);
  try {
    const data = await apiFetch(`${API_PREFIX}/connections/query/${connectionId}`, { method: 'GET' });
    if (!data || !Array.isArray(data.tables)) throw new Error('Respuesta inesperada de /query');

    if (data.tables.length === 0) {
      tablesList.innerHTML = '<p>No hay tablas.</p>';
      tablesSection.classList.remove('hidden');
      recordsSection.classList.add('hidden');
      return;
    }

    tablesSection.classList.remove('hidden');
    recordsSection.classList.add('hidden');
    formRecordCard.classList.add('hidden');
    tablesList.innerHTML = data.tables
      .map((name) => `<button class="table-item" data-table="${name}">${name}</button>`)
      .join('');

    document.querySelectorAll('#tables-list .table-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tableName = btn.getAttribute('data-table');
        selectedTable = tableName;
        document.querySelectorAll('#tables-list .table-item').forEach((b) => b.classList.remove('selected-row'));
        btn.classList.add('selected-row');
        loadTableRecords(connectionId, tableName);
      });
    });

    setMessage('Tablas cargadas', false);
    setConnectionOverview({
      connectionName: selectedConnectionName || `ID ${connectionId}`,
      totalTables: data.tables.length,
      activeTable: selectedTable || 'Ninguna',
      activeRows: 0,
      totalRows: 0,
      tablesWithData: 'N/A',
    });

    await loadConnectionStats(connectionId, selectedTable);
  } catch (error) {
    setMessage(`Error al cargar tablas: ${error.message}`, true);
  }
};

const setConnectionOverview = ({ connectionName = 'Sin conexión', totalTables = 0, tablesWithData = 'N/A', activeTable = 'Ninguna', activeRows = 0, totalRows = 0 }) => {
  document.getElementById('connection-overview').classList.remove('hidden');
  document.getElementById('conn-name-value').textContent = connectionName;
  document.getElementById('conn-tables-count').textContent = totalTables;
  document.getElementById('conn-tables-with-data').textContent = tablesWithData;
  document.getElementById('conn-active-table').textContent = activeTable;
  document.getElementById('conn-active-rows').textContent = activeRows;
  document.getElementById('conn-total-rows').textContent = totalRows;
};

const loadConnectionStats = async (connectionId, activeTableName = null) => {
  try {
    const stats = await apiFetch(`${API_PREFIX}/connections/stats/${connectionId}`, { method: 'GET' });
    latestConnectionStats = stats;
    setConnectionOverview({
      connectionName: selectedConnectionName || `ID ${connectionId}`,
      totalTables: stats.tableCount || 0,
      tablesWithData: stats.tablesWithRows ?? 'N/A',
      activeTable: activeTableName || 'Ninguna',
      activeRows: activeTableName ? (stats.perTable?.find((item) => item.tableName === activeTableName)?.rowCount || 0) : 0,
      totalRows: stats.totalRows || 0,
    });
    renderDecisionDashboard(stats, activeTableName);
    drawConnectionCharts(stats, activeTableName);
  } catch (error) {
    console.warn('No se pudo cargar métricas de conexión:', error);
    chartsSection.classList.add('hidden');
  }
};

const drawConnectionCharts = (stats, activeTableName = null) => {
  if (!stats || !Array.isArray(stats.perTable)) {
    chartsSection.classList.add('hidden');
    return;
  }

  chartsSection.classList.remove('hidden');

  const withData = Number(stats.tablesWithRows || 0);
  const noData = Number(stats.tableCount || 0) - withData;
  drawPieChart(pieCanvas, withData, noData);
  drawBarChart(barCanvas, stats.perTable, activeTableName);
};

const drawPieChart = (canvas, valueA, valueB) => {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  const total = valueA + valueB;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (total === 0) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos', canvas.width / 2, canvas.height / 2);
    return;
  }

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) * 0.35;

  const startAngle = 0;
  const angleA = (valueA / total) * Math.PI * 2;

  // Segmento con datos
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radius, startAngle, startAngle + angleA);
  ctx.closePath();
  ctx.fillStyle = '#4f46e5';
  ctx.fill();

  // Segmento sin datos
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.arc(centerX, centerY, radius, startAngle + angleA, startAngle + Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = '#dbeafe';
  ctx.fill();

  // Texto
  ctx.fillStyle = '#111827';
  ctx.font = '600 16px Plus Jakarta Sans';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round((valueA / total) * 100)}% con datos`, centerX, centerY + radius + 24);
};

const drawBarChart = (canvas, data, activeTableName) => {
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  const items = data.slice().sort((a, b) => b.rowCount - a.rowCount).slice(0, 8);
  const maxValue = Math.max(1, ...items.map((item) => item.rowCount));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (items.length === 0) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '14px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Sin tablas para graficar', canvas.width / 2, canvas.height / 2);
    return;
  }

  const padding = 30;
  const chartWidth = canvas.width - padding * 2;
  const chartHeight = canvas.height - padding * 2;
  const barWidth = chartWidth / items.length * 0.65;

  // Ejes
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, padding + chartHeight);
  ctx.lineTo(padding + chartWidth, padding + chartHeight);
  ctx.stroke();

  // Barras
  items.forEach((item, index) => {
    const ratio = item.rowCount / maxValue;
    const height = ratio * (chartHeight - 20);
    const x = padding + index * (chartWidth / items.length) + (chartWidth / items.length - barWidth) / 2;
    const y = padding + chartHeight - height;

    ctx.fillStyle = item.tableName === activeTableName ? '#4f46e5' : '#93c5fd';
    ctx.fillRect(x, y, barWidth, height);

    ctx.fillStyle = '#111827';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText(item.tableName, x + barWidth / 2, padding + chartHeight + 12);
  });
};

const buildFormFields = (columns, values = {}) => {
  const isVentaTable = selectedTable?.toLowerCase() === 'ventas';
  const isUsuariosTable = selectedTable?.toLowerCase() === 'usuarios';

  formFields.innerHTML = columns
    .filter((column) => {
      const name = column.toLowerCase();
      if (mode === 'create') {
        if (['id', ...autoTimestampFields].includes(name)) return false;
        if (isVentaTable && ['total', 'fecha'].includes(name)) return false;
        if (isUsuariosTable && autoTimestampFields.includes(name)) return false;
      }
      return true;
    })
    .map((column) => {
      const name = column.toLowerCase();
      const value = values[column] !== undefined && values[column] !== null ? values[column] : '';
      const readonlyFields = ['id'];
      if (isVentaTable && ['total', 'fecha'].includes(name)) readonlyFields.push(name);
      if (autoTimestampFields.includes(name)) readonlyFields.push(name);
      const isReadonly = readonlyFields.includes(name);
      const disabledAttr = isReadonly ? 'disabled' : '';

      return `
        <div class="form-group">
          <label for="field-${column}">${column}</label>
          <input type="text" id="field-${column}" name="${column}" value="${value}" ${disabledAttr} />
        </div>
      `;
    })
    .join('');
};

const loadTableRecords = async (connectionId, tableName) => {
  setMessage('Cargando registros...', false);
  try {
    const data = await apiFetch(`${API_PREFIX}/connections/table/${connectionId}/${encodeURIComponent(tableName)}`, { method: 'GET' });
    if (!data || !Array.isArray(data.data)) throw new Error('Respuesta inesperada de /table');

    currentRecords = sortRowsById(data.data);
    recordsSection.classList.remove('hidden');
    formRecordCard.classList.add('hidden');
    btnCancel.style.display = 'none';

    if (currentRecords.length === 0) {
      recordsList.innerHTML = '<p>No hay registros en esta tabla.</p>';
      tableColumnsAll = Array.isArray(data.columns) && data.columns.length > 0
        ? data.columns
        : await loadTableColumns(connectionId, tableName);
      tableColumns = tableColumnsAll.filter((key) => key.toLowerCase() !== 'password');
      setMessage(tableColumns.length > 0
        ? 'Tabla sin registros. Ya puedes crear el primer registro.'
        : 'Tabla sin registros y sin columnas disponibles', false);
      return;
    }

    tableColumnsAll = Array.isArray(data.columns) && data.columns.length > 0
      ? data.columns
      : Object.keys(currentRecords[0]);
    tableColumns = tableColumnsAll.filter((key) => key.toLowerCase() !== 'password');

    setConnectionOverview({
      connectionName: selectedConnectionName || `ID ${selectedConnection}`,
      totalTables: document.getElementById('conn-tables-count')?.textContent || 0,
      tablesWithData: document.getElementById('conn-tables-with-data')?.textContent || 'N/A',
      activeTable: selectedTable || 'Ninguna',
      activeRows: currentRecords.length,
      totalRows: Number(document.getElementById('conn-total-rows')?.textContent || 0),
    });

    if (latestConnectionStats) {
      renderDecisionDashboard(latestConnectionStats, selectedTable);
      drawConnectionCharts(latestConnectionStats, selectedTable);
    }

    const rowsHtml = currentRecords
      .map((row) => {
        const columnsHtml = tableColumns
          .map((key) => `<td>${row[key] !== undefined && row[key] !== null ? row[key] : ''}</td>`)
          .join('');
        const recordId = row.id !== undefined ? row.id : '';
        return `
          <tr data-record-id="${recordId}">
            ${columnsHtml}
            <td>
              <button class="btn-action-edit" data-record-id="${recordId}">Editar</button>
              <button class="btn-action-delete" data-record-id="${recordId}">Eliminar</button>
            </td>
          </tr>
        `;
      })
      .join('');

    const ths = tableColumns.map((column) => `<th>${column}</th>`).join('');

    recordsList.innerHTML = `
      <table>
        <thead>
          <tr>${ths}<th>Acciones</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;

    document.querySelectorAll('#records-list .btn-action-edit').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const recordId = btn.getAttribute('data-record-id');
        startEditRecord(recordId);
      });
    });

    document.querySelectorAll('#records-list .btn-action-delete').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const recordId = btn.getAttribute('data-record-id');
        deleteRecord(recordId);
      });
    });

    setMessage('Registros cargados', false);
  } catch (error) {
    recordsList.innerHTML = `<p>Error al cargar registros: ${error.message}</p>`;
    setMessage(`Error al cargar registros: ${error.message}`, true);
  }
};

const showRecordForm = (formMode = 'create') => {
  mode = formMode;
  formRecordCard.classList.remove('hidden');
  btnCancel.style.display = 'inline-block';
  if (mode === 'create') {
    formTitle.textContent = 'Crear registro';
    buildFormFields(tableColumnsAll, {});
  } else {
    formTitle.textContent = 'Editar registro';
  }
};

const startCreateRecord = () => {
  if (!selectedConnection || !selectedTable || tableColumns.length === 0) {
    setMessage('Selecciona una tabla con columnas válidas primero', true);
    return;
  }

  editingRecordId = null;
  showRecordForm('create');
};

const startEditRecord = (recordId) => {
  if (!recordId) return;
  const record = currentRecords.find((r) => `${r.id}` === `${recordId}`);
  if (!record) {
    setMessage('Registro no encontrado para editar', true);
    return;
  }

  editingRecordId = recordId;
  showRecordForm('edit');
  buildFormFields(tableColumnsAll, record);
};

const clearForm = () => {
  formRecordCard.classList.add('hidden');
  btnCancel.style.display = 'none';
  formFields.innerHTML = '';
  editingRecordId = null;
};

const saveRecord = async (event) => {
  event.preventDefault();
  if (!selectedConnection || !selectedTable) {
    setMessage('Datos insuficientes para guardar', true);
    return;
  }

  const formData = {};
  tableColumnsAll.forEach((fieldName) => {
    const lname = fieldName.toLowerCase();
    if (lname === 'id' || autoTimestampFields.includes(lname)) {
      return; // no enviar campos inmutables
    }

    const input = document.getElementById(`field-${fieldName}`);
    if (input) {
      formData[fieldName] = input.value;
    }
  });

  try {
    const isVentaTable = selectedTable?.toLowerCase() === 'ventas';
    if (isVentaTable) {
      const cantidad = parseFloat(formData.cantidad);
      const precioUnitario = parseFloat(formData.precio_unitario);
      if (!Number.isNaN(cantidad) && !Number.isNaN(precioUnitario)) {
        formData.total = cantidad * precioUnitario;
      }
      if (!formData.fecha) {
        const now = new Date();
        formData.fecha = now.toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    const isUsuariosTable = selectedTable?.toLowerCase() === 'usuarios';
    if (isUsuariosTable) {
      autoTimestampFields.forEach((fieldName) => delete formData[fieldName]);
    }

    if (mode === 'edit') {
      if (isVentaTable) {
        delete formData.total;
        delete formData.fecha;
      }
      if (isUsuariosTable) {
        autoTimestampFields.forEach((fieldName) => delete formData[fieldName]);
      }
    }

    if (mode === 'create') {
      await apiFetch(`${API_PREFIX}/connections/insert/${selectedConnection}/${encodeURIComponent(selectedTable)}`, {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setMessage('Registro creado', false);
    } else {
      if (!editingRecordId) throw new Error('No hay registro seleccionado para editar');
      const updateResponse = await apiFetch(`${API_PREFIX}/connections/update/${selectedConnection}/${encodeURIComponent(selectedTable)}/${editingRecordId}`, {
        method: 'PUT',
        body: JSON.stringify(formData),
      });
      if (updateResponse.sync?.estado === 'warning') {
        setMessage(`Registro actualizado. ${updateResponse.sync.mensaje}`, false);
      } else if (updateResponse.sync?.estado === 'error') {
        setMessage(`Registro actualizado, pero no se sincronizo MySQL: ${updateResponse.sync.mensaje}`, true);
      } else {
        setMessage('Registro actualizado', false);
      }
    }

    clearForm();
    await loadTableRecords(selectedConnection, selectedTable);
  } catch (error) {
    setMessage(`Error al guardar: ${error.message}`, true);
  }
};

const deleteRecord = async (recordId) => {
  if (!recordId || !selectedConnection || !selectedTable) {
    setMessage('No se pudo eliminar el registro', true);
    return;
  }
  if (!confirm(`Confirmar eliminación del registro id=${recordId}?`)) {
    return;
  }

  try {
    await apiFetch(`${API_PREFIX}/connections/delete/${selectedConnection}/${encodeURIComponent(selectedTable)}/${recordId}`, {
      method: 'DELETE',
    });
    setMessage('Registro eliminado', false);
    await loadTableRecords(selectedConnection, selectedTable);
  } catch (error) {
    setMessage(`Error al eliminar: ${error.message}`, true);
  }
};





btnLogout.addEventListener('click', () => {
  localStorage.removeItem('portalToken');
  window.location.href = '/';
});

btnRefresh.addEventListener('click', async () => {
  await loadConnections();
});
btnExportExcel.addEventListener('click', exportConnectionToExcel);
btnNewConnection.addEventListener('click', () => {
  newConnectionForm.classList.toggle('hidden');
});
btnCancelConnection.addEventListener('click', () => {
  newConnectionForm.classList.add('hidden');
  connectionForm.reset();
});

connectionForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = {
    name: document.getElementById('conn-name').value.trim(),
    host: document.getElementById('conn-host').value.trim(),
    port: document.getElementById('conn-port').value.trim(),
    user: document.getElementById('conn-user').value.trim(),
    password: document.getElementById('conn-password').value.trim(),
    database_name: document.getElementById('conn-dbname').value.trim(),
    engine: document.getElementById('conn-engine').value,
  };

  if (!formData.name || !formData.host || !formData.port || !formData.user || !formData.password || !formData.database_name || !formData.engine) {
    setMessage('Todos los campos son obligatorios para la nueva conexión.', true);
    return;
  }

  try {
    await apiFetch(`${API_PREFIX}/connections`, {
      method: 'POST',
      body: JSON.stringify(formData),
    });

    setMessage('Conexión creada correctamente.', false);
    connectionForm.reset();
    newConnectionForm.classList.add('hidden');
    await loadConnections();
  } catch (error) {
    setMessage(`Error al crear conexión: ${error.message}`, true);
  }
});

btnNewRecord.addEventListener('click', startCreateRecord);
btnCancel.addEventListener('click', clearForm);
formRecord.addEventListener('submit', saveRecord);
sidebarTabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

if (ensureAuth()) {
  loadConnections();
}
