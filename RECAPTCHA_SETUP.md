# Configuración de Google reCAPTCHA v3

## Pasos para obtener las claves de reCAPTCHA:

1. Ve a: https://www.google.com/recaptcha/admin
2. Inicia sesión con tu cuenta Google
3. Haz clic en el ícono "+" para crear un nuevo sitio
4. Completa:
   - **Label**: Portal Admin (o el nombre que desees)
   - **reCAPTCHA type**: Selecciona "reCAPTCHA v3"
   - **Domains**: localhost (para desarrollo)
5. Haz clic en "Submit"
6. Se te mostrarán dos claves:
   - **Site Key** (Clave del sitio)
   - **Secret Key** (Clave secreta)

## Configuración en el proyecto:

### Frontend (`public/login.js`)
Reemplaza `YOUR_RECAPTCHA_SITE_KEY` por tu Site Key:
```javascript
const RECAPTCHA_SITE_KEY = 'tu_site_key_aqui';
```

### Backend (`.env`)
Agrega tu Secret Key:
```
RECAPTCHA_SECRET_KEY=tu_secret_key_aqui
```

### HTML (`public/index.html`)
El widget ya está configurado en los formularios de login y registro.

## Cómo funciona:

- **reCAPTCHA v3**: No requiere interacción del usuario
- Score: 0.0 (probable bot) a 1.0 (probable usuario real)
- Validamos scores > 0.5
- Si falla, no permite login/registro

## Notas:

- En desarrollo local, reCAPTCHA está deshabilitado en algunos casos
- Si no configuras las claves, el sistema continúa funcionando sin validación
- Para producción, siempre configura las claves correctamente
