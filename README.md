# Registro fotográfico de fiscalización

Aplicación frontend (HTML, CSS y JavaScript) para registrar una fiscalización
simulada, tomar o elegir fotografías, describirlas, ordenarlas y generar un
anexo fotográfico en Word (.docx). Todos los datos son de práctica.

## Estructura

```
index.html
estilos.css
Db.js            Guardado en IndexedDB (proyectos y fotos como Blob)
Exportar.js      Construcción del documento Word
app.js           Interfaz, eventos y validaciones
```

La librería `docx` se carga desde CDN para evitar depender de una carpeta `js/lib` que no existe en esta versión del proyecto.

## Cómo ejecutarlo

### Opción 1: Visual Studio Code con Live Server (recomendada)
1. Abre la carpeta del proyecto en VS Code.
2. Instala la extensión **Live Server** (Ritwick Dey).
3. Clic derecho en `index.html` y elige **Open with Live Server**.
4. Se abre `http://127.0.0.1:5500/`.

### Opción 2: abrir el archivo
Haz doble clic en `index.html`. Funciona en la mayoría de navegadores, pero
los datos quedan asociados a esa forma de abrirlo; usa siempre la misma.

## Cómo usar la captura en el celular

En celulares, **Tomar foto** usa `<input type="file" accept="image/*" capture="environment">`,
que puede abrir la cámara posterior según el dispositivo. En computadoras abre una
vista de cámara web usando `getUserMedia`; el navegador debe tener permiso y la
página debe servirse desde `localhost` o HTTPS. Para probar en una computadora
con Laragon, coloca la carpeta dentro de `C:\laragon\www`; si la nombras
`registro-fotografico`, abre `http://localhost/registro-fotografico/`.
Guarda primero un proyecto, pulsa **Tomar foto** y permite el acceso a la webcam.

Para probar en un celular real:
1. Conecta PC y celular a la misma red Wi-Fi.
2. Averigua la IP de tu PC (`ipconfig` en Windows, por ejemplo `192.168.1.20`).
3. Publica la aplicación con HTTPS. Abrir la IP local por HTTP puede servir la página, pero el navegador normalmente bloqueará el acceso a la cámara del celular porque no es un contexto seguro.
4. Pulsa **Tomar foto** y permite el acceso a la cámara si el navegador lo solicita.

Puedes usar GitHub Pages, un reenvío HTTPS de puertos de VS Code o un túnel HTTPS.

Si se cancela la captura o se deniega el permiso, la aplicación muestra un
mensaje y se puede seguir trabajando.

## Funciones

- Crear, editar, abrir y eliminar proyectos (código, fecha, lugar, fiscalizador, establecimiento).
- Cada proyecto tiene sus propias fotos; no se mezclan.
- Tomar foto o agregar varias imágenes, con vista previa antes de confirmar.
- Ficha por foto: imagen, descripción editable, fecha y hora de incorporación a la app e identificador propio.
- Búsqueda de fotos por número, nombre de archivo, descripción o fecha; filtros para ver todas, las descritas o las pendientes.
- Resumen del total de fotos registradas, cuántas tienen descripción y cuántas faltan describir.
- Mover arriba/abajo y eliminar con confirmación. La numeración (Foto N.º 01, 02, 03…) sigue el orden elegido.
- Guardado automático en IndexedDB (la imagen se guarda como Blob).
- Vista previa del anexo y exportación a un `.docx` real con imágenes incrustadas.
- La exportación se bloquea y explica qué falta si hay datos del proyecto sin completar, no hay fotos o alguna foto no tiene descripción.

## Formato del Word

A4 vertical, márgenes de 2,54 cm, una tabla continua de dos columnas (la fila
de la imagen está combinada), número a la izquierda y descripción a la derecha,
fuente Poppins de 8 puntos y dos fotografías por página. Cada foto no se separa
de su descripción.

## Dependencias

- [docx](https://www.npmjs.com/package/docx) 9.5.0, cargada desde un CDN; requiere conexión a Internet para generar el documento.
- No requiere servidor, cuentas ni instalación de paquetes.

## Limitaciones conocidas

- Los datos viven en el navegador y el perfil donde se crearon. Si se borran los datos del sitio o se usa otro navegador/dispositivo, no se ven.
- En modo privado/incógnito el navegador puede borrar los datos al cerrar.
- Las fotos se reducen a un máximo de 1600 px de lado y se guardan como JPEG para ahorrar espacio.
- La fecha y hora de cada foto es la de su incorporación a la aplicación; no certifica la fecha original de la imagen.
- Poppins debe estar instalada en el equipo para verse en el Word; si no, Word usa otra fuente similar. Se puede instalar gratis desde Google Fonts.
- No es una aplicación instalable (PWA). Funciona sin Internet mientras la carpeta se sirva localmente, pero no se probó el modo sin conexión en un servidor remoto.
- Usa el elemento `<dialog>`, por lo que requiere un navegador actual (Chrome, Edge, Firefox o Safari recientes).