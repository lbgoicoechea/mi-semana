# Mi semana

App web personal para organizar las tareas de la semana con una matriz de prioridad (Eisenhower).

## Cómo abrirla

Opción rápida: doble clic en `index.html`.

Opción con servidor local (recomendada):

```bash
python3 -m http.server 8000
```

y abrir http://localhost:8000

## Qué hace

- **Matriz de 4 cuadrantes:** Hacer ya · Planificar · Delegar / rápido · Después.
- **Cada tarea tiene** título, cuadrante, día (Lun–Dom), categoría (Trabajo / Personal / Entrenamiento y salud), duración estimada y hora (las dos últimas son opcionales).
- **Filtros** por día y por categoría. Cada cuadrante muestra cuántas tareas pendientes tiene y el tiempo total estimado.
- **Arrastrar y soltar** una tarea en otro cuadrante cambia su prioridad.
- **Cambio de semana automático:** al empezar una semana nueva, las tareas pendientes pasan solas y las hechas van al **Historial**.
- Los datos se guardan en el navegador (`localStorage`). Si borrás los datos del sitio o usás otro navegador, no vas a ver las mismas tareas.

## Archivos

- `index.html`: la estructura de la página.
- `styles.css`: los estilos (modo claro/oscuro y versión para celular).
- `storage.js`: el guardado, el cálculo de la semana ISO y el traspaso de semana.
- `app.js`: el render, los filtros, el modal y el drag & drop.
