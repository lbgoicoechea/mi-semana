# Mi semana

App web personal para organizar las tareas de la semana con una matriz de prioridad (Eisenhower).

## Cómo abrirla

Con un servidor local (el login por email no funciona abriendo el archivo con doble clic):

```bash
python3 -m http.server 8000
```

y abrir http://localhost:8000. La versión publicada está en Vercel.

## Base de datos (Supabase)

Las tareas se guardan en Supabase, así que se ven iguales en la compu y en el celular, y los cambios aparecen en tiempo real.

1. Creá un proyecto en supabase.com.
2. En **SQL Editor**, pegá y corré [`supabase/schema.sql`](supabase/schema.sql). Crea la tabla `tasks`, la seguridad (cada usuario ve solo sus tareas) y activa el tiempo real.
3. En **Authentication → URL Configuration**:
   - **Site URL:** la dirección de Vercel.
   - **Redirect URLs:** la dirección de Vercel y `http://localhost:8000`.
4. En **Project Settings → API**, copiá la *Project URL* y la *anon / publishable key* en [`config.js`](config.js). Nunca pongas ahí la *service_role / secret key*.
5. Después de entrar por primera vez, desactivá **Authentication → Sign In / Providers → Allow new users to sign up**, para que nadie más pueda crear una cuenta.

Si tenías tareas guardadas en el navegador, de la versión anterior, la app te ofrece subirlas a tu cuenta la primera vez que entrás.

## Qué hace

- **Matriz de 4 cuadrantes:** Hacer ya · Planificar · Delegar / rápido · Después.
- **Cada tarea tiene** título, cuadrante, día (Lun–Dom), categoría (Trabajo / Personal / Entrenamiento y salud), duración estimada y hora (las dos últimas son opcionales).
- **Filtros** por día y por categoría. Cada cuadrante muestra cuántas tareas pendientes tiene y el tiempo total estimado.
- **Arrastrar y soltar** una tarea en otro cuadrante cambia su prioridad.
- **Cambio de semana automático:** al empezar una semana nueva, las tareas pendientes pasan solas y las hechas van al **Historial**.
- **Login con link por email** y sincronización en tiempo real entre dispositivos.

## Archivos

- `index.html`: la estructura de la página (carga, login y app).
- `styles.css`: los estilos (modo claro/oscuro y versión para celular).
- `config.js`: la URL y la clave pública de Supabase.
- `storage.js`: el acceso a Supabase, el cálculo de la semana ISO y la lectura de los datos locales viejos.
- `app.js`: la sesión, el render, los filtros, el modal, el drag & drop y la migración.
- `supabase/schema.sql`: la tabla, la seguridad y el tiempo real.
