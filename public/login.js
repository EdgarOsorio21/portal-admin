const API_PREFIX = '/api';

function setToken(token) {
  localStorage.setItem('portalToken', token);
}

function showMessage(text, isError = true, isRegister = false) {
  const messageElem = document.getElementById(isRegister ? 'register-message' : 'login-message');
  messageElem.textContent = text;
  messageElem.style.color = isError ? '#dc2626' : '#16a34a';
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('register-screen').classList.add('hidden');
  showMessage('', false);
}

function showRegister() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('register-screen').classList.remove('hidden');
  showMessage('', false, true);
}

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    return showMessage('Completa email y contrasena');
  }

  showMessage('Iniciando sesion...', false);

  try {
    const resp = await fetch(`${API_PREFIX}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || resp.statusText);
    }

    const { token } = await resp.json();
    setToken(token);
    showMessage('Inicio de sesion exitoso. Redirigiendo...', false);
    setTimeout(() => {
      window.location.href = '/dashboard.html';
    }, 500);
  } catch (error) {
    showMessage(`Error: ${error.message}`);
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  if (!name || !email || !password) {
    return showMessage('Completa nombre, email y contrasena', true, true);
  }

  showMessage('Registrando usuario...', false, true);

  try {
    const resp = await fetch(`${API_PREFIX}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || errData.message || resp.statusText);
    }

    showMessage('Usuario registrado correctamente. Ahora puedes iniciar sesion.', false, true);
    setTimeout(() => showLogin(), 2000);
  } catch (error) {
    showMessage(`Error: ${error.message}`, true, true);
  }
}

document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('btn-register').addEventListener('click', handleRegister);
document.getElementById('btn-show-register').addEventListener('click', showRegister);
document.getElementById('btn-show-login').addEventListener('click', showLogin);

if (localStorage.getItem('portalToken')) {
  window.location.href = '/dashboard.html';
}
