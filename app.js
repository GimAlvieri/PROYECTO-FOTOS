/* ============================================================
   app.js  -  Lógica de la interfaz
   Depende de: BaseDatos (Db.js), Exportar (Exportar.js), docx (lib)
   ============================================================ */
(() => {
  'use strict';

  /* ---------- Constantes y estado ---------- */
  const LADO_MAXIMO = 1600;      // px: se reduce la foto para no llenar el almacenamiento
  const CALIDAD_JPEG = 0.85;
  const CAMPOS = ['codigo', 'fecha', 'lugar', 'fiscalizador', 'establecimiento'];
  const NOMBRES_CAMPO = {
    codigo: 'el código de práctica',
    fecha: 'la fecha',
    lugar: 'el lugar',
    fiscalizador: 'el nombre del fiscalizador',
    establecimiento: 'la denominación del establecimiento o unidad',
  };

  const estado = {
    proyectos: [],        // lista de proyectos guardados
    proyecto: null,       // proyecto abierto (null = proyecto nuevo sin guardar)
    fotos: [],            // fotos del proyecto abierto, en el orden final
    urls: new Map(),      // id de foto -> URL temporal SOLO para mostrar en pantalla
    pendientes: new Map(),// id de foto -> temporizador de guardado de descripción
    ocupado: false,       // hay fotos en proceso de confirmación
    flujoCamara: null,
  };

  const $ = (selector) => document.querySelector(selector);
  const el = {
    selProyecto: $('#selProyecto'),
    btnNuevo: $('#btnNuevo'),
    form: $('#formProyecto'),
    btnEliminarProyecto: $('#btnEliminarProyecto'),
    avisoSinProyecto: $('#avisoSinProyecto'),
    btnTomar: $('#btnTomar'),
    btnAgregar: $('#btnAgregar'),
    inpCamara: $('#inpCamara'),
    inpArchivos: $('#inpArchivos'),
    buscarFotos: $('#buscarFotos'),
    filtroFotos: $('#filtroFotos'),
    resumenFotos: $('#resumenFotos'),
    galeria: $('#galeria'),
    vistaPrevia: $('#vistaPrevia'),
    panelProblemas: $('#panelProblemas'),
    btnGenerar: $('#btnGenerar'),
    dlgFoto: $('#dlgFoto'),
    dlgFotoImg: $('#dlgFotoImg'),
    dlgFotoTitulo: $('#dlgFotoTitulo'),
    dlgFotoDescripcion: $('#dlgFotoDescripcion'),
    dlgCamara: $('#dlgCamara'),
    videoCamara: $('#videoCamara'),
    estadoCamara: $('#estadoCamara'),
    btnCapturar: $('#btnCapturar'),
    btnCerrarCamara: $('#btnCerrarCamara'),
    dlgConfirmar: $('#dlgConfirmar'),
    dlgConfirmarTexto: $('#dlgConfirmarTexto'),
    mensajes: $('#mensajes'),
  };

  /* ---------- Utilidades ---------- */
  function generarId(prefijo) {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return `${prefijo}-${crypto.randomUUID()}`;
    }
    // Plan B para contextos no seguros (http en la red local)
    return `${prefijo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function formatoFechaHora(iso) {
    return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  }

  function hoyISO() {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  function mostrarMensaje(texto, tipo = 'ok') {
    const caja = document.createElement('div');
    caja.className = `mensaje ${tipo}`;
    caja.textContent = texto;
    el.mensajes.appendChild(caja);
    setTimeout(() => caja.remove(), tipo === 'error' ? 7000 : 4000);
  }

  function textoError(error) {
    return (error && error.message) ? error.message : String(error);
  }

  function ultimoProyecto(valor) {
    try {
      if (valor === undefined) return localStorage.getItem('ultimoProyecto');
      if (valor === null) localStorage.removeItem('ultimoProyecto');
      else localStorage.setItem('ultimoProyecto', valor);
    } catch (e) { /* localStorage no disponible: no es grave */ }
    return null;
  }

  // Confirmación con diálogo propio (devuelve una promesa true/false)
  function confirmar(texto) {
    return new Promise((resolver) => {
      el.dlgConfirmarTexto.textContent = texto;
      el.dlgConfirmar.addEventListener('close', () => {
        resolver(el.dlgConfirmar.returnValue === 'si');
      }, { once: true });
      el.dlgConfirmar.returnValue = 'no';
      el.dlgConfirmar.showModal();
    });
  }

  /* ---------- URLs temporales (solo para mostrar) ---------- */
  function urlDe(foto) {
    if (!estado.urls.has(foto.id)) estado.urls.set(foto.id, URL.createObjectURL(foto.blob));
    return estado.urls.get(foto.id);
  }

  function liberarUrls() {
    estado.urls.forEach((url) => URL.revokeObjectURL(url));
    estado.urls.clear();
  }

  /* ============================================================
     1. PROYECTO
     ============================================================ */
  function leerFormulario() {
    const datos = {};
    CAMPOS.forEach((c) => { datos[c] = el.form.elements[c].value.trim(); });
    return datos;
  }

  function escribirFormulario(proyecto) {
    CAMPOS.forEach((c) => { el.form.elements[c].value = proyecto ? proyecto[c] : ''; });
    if (!proyecto) el.form.elements.fecha.value = hoyISO();
    limpiarErroresCampos();
  }

  function validarProyecto(datos) {
    return CAMPOS
      .filter((c) => !datos[c])
      .map((c) => ({ campo: c, mensaje: `Falta ${NOMBRES_CAMPO[c]}.` }));
  }

  function limpiarErroresCampos() {
    CAMPOS.forEach((c) => {
      el.form.elements[c].removeAttribute('aria-invalid');
      $(`#err-${c}`).textContent = '';
    });
  }

  function mostrarErroresCampos(errores) {
    limpiarErroresCampos();
    errores.forEach(({ campo, mensaje }) => {
      el.form.elements[campo].setAttribute('aria-invalid', 'true');
      $(`#err-${campo}`).textContent = mensaje;
    });
  }

  function hayCambiosSinGuardar() {
    const datos = leerFormulario();
    if (!estado.proyecto) {
      // proyecto nuevo: hay cambios si el usuario escribió algo (la fecha viene precargada)
      return CAMPOS.some((c) => c !== 'fecha' && datos[c] !== '');
    }
    return CAMPOS.some((c) => datos[c] !== estado.proyecto[c]);
  }

  async function alGuardarProyecto(evento) {
    evento.preventDefault();
    const datos = leerFormulario();
    const errores = validarProyecto(datos);
    mostrarErroresCampos(errores);
    if (errores.length) {
      el.form.elements[errores[0].campo].focus();
      mostrarMensaje('Completa los campos obligatorios del proyecto.', 'error');
      return;
    }

    const ahora = new Date().toISOString();
    const proyecto = estado.proyecto
      ? { ...estado.proyecto, ...datos, modificado: ahora }
      : { id: generarId('proy'), ...datos, creado: ahora, modificado: ahora };

    try {
      await BaseDatos.guardarProyecto(proyecto);
      const eraNuevo = !estado.proyecto;
      estado.proyecto = proyecto;
      if (eraNuevo) estado.fotos = [];
      ultimoProyecto(proyecto.id);
      await cargarListaProyectos();
      actualizarInterfaz();
      mostrarMensaje(eraNuevo ? 'Proyecto creado y guardado.' : 'Cambios del proyecto guardados.');
    } catch (error) {
      mostrarMensaje(`No se pudo guardar el proyecto: ${textoError(error)}`, 'error');
    }
  }

  async function cargarListaProyectos() {
    const lista = await BaseDatos.listarProyectos();
    lista.sort((a, b) => b.modificado.localeCompare(a.modificado));
    estado.proyectos = lista;
    pintarSelector();
  }

  function pintarSelector() {
    el.selProyecto.innerHTML = '';
    if (!estado.proyecto) {
      const opcion = new Option(
        estado.proyectos.length ? 'Proyecto nuevo (sin guardar)' : 'Aún no hay proyectos guardados', ''
      );
      el.selProyecto.add(opcion);
    }
    estado.proyectos.forEach((p) => {
      el.selProyecto.add(new Option(`${p.codigo} - ${p.establecimiento}`, p.id));
    });
    el.selProyecto.value = estado.proyecto ? estado.proyecto.id : '';
  }

  async function abrirProyecto(id) {
    await guardarPendientes();
    try {
      const proyecto = await BaseDatos.obtenerProyecto(id);
      if (!proyecto) throw new Error('El proyecto ya no existe.');
      const fotos = await BaseDatos.listarFotos(id);   // solo las fotos de ESTE proyecto
      liberarUrls();
      estado.proyecto = proyecto;
      estado.fotos = fotos;
      ultimoProyecto(id);
      escribirFormulario(proyecto);
      ocultarProblemas();
      pintarSelector();
      actualizarInterfaz();
    } catch (error) {
      mostrarMensaje(`No se pudo abrir el proyecto: ${textoError(error)}`, 'error');
      pintarSelector();
    }
  }

  async function alCambiarSelector() {
    const id = el.selProyecto.value;
    if (!id) return;
    if (hayCambiosSinGuardar() && !(await confirmar('Hay cambios sin guardar en el proyecto. ¿Descartarlos y abrir otro proyecto?'))) {
      pintarSelector();
      return;
    }
    await abrirProyecto(id);
  }

  async function alPulsarNuevo() {
    if (hayCambiosSinGuardar() && !(await confirmar('Hay cambios sin guardar en el proyecto. ¿Descartarlos y empezar uno nuevo?'))) {
      return;
    }
    await guardarPendientes();
    liberarUrls();
    estado.proyecto = null;
    estado.fotos = [];
    escribirFormulario(null);
    ocultarProblemas();
    pintarSelector();
    actualizarInterfaz();
    el.form.elements.codigo.focus();
  }

  async function alEliminarProyecto() {
    if (!estado.proyecto) return;
    const texto = `Se eliminará el proyecto "${estado.proyecto.codigo}" con sus ${estado.fotos.length} foto(s). Esta acción no se puede deshacer. ¿Continuar?`;
    if (!(await confirmar(texto))) return;
    try {
      await BaseDatos.eliminarProyecto(estado.proyecto.id);
      mostrarMensaje('Proyecto eliminado.');
      ultimoProyecto(null);
      liberarUrls();
      estado.proyecto = null;
      estado.fotos = [];
      await cargarListaProyectos();
      if (estado.proyectos.length) await abrirProyecto(estado.proyectos[0].id);
      else { escribirFormulario(null); actualizarInterfaz(); }
    } catch (error) {
      mostrarMensaje(`No se pudo eliminar el proyecto: ${textoError(error)}`, 'error');
    }
  }

  /* ============================================================
     2. CAPTURA E INCORPORACIÓN DE FOTOS
     ============================================================ */

  // Reduce la foto y la convierte a JPEG. Respeta la orientación EXIF del celular.
  async function procesarImagen(archivo) {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('el archivo no es una imagen');
    }
    let origen;
    try {
      origen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch (e) {
      origen = await cargarConImagen(archivo);
    }
    const escala = Math.min(1, LADO_MAXIMO / Math.max(origen.width, origen.height));
    const ancho = Math.round(origen.width * escala);
    const alto = Math.round(origen.height * escala);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#ffffff';              // fondo blanco por si la imagen tiene transparencia
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(origen, 0, 0, ancho, alto);
    if (origen.close) origen.close();

    const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG));
    if (!blob) throw new Error('no se pudo convertir la imagen');
    return { blob, ancho, alto, nombreOriginal: archivo.name || 'foto' };
  }

  function cargarConImagen(archivo) {
    return new Promise((resolver, rechazar) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolver(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rechazar(new Error('no se pudo leer la imagen')); };
      img.src = url;
    });
  }

  // Muestra la vista previa y espera la decisión del usuario.
  function pedirConfirmacion(imagen, posicion, total) {
    return new Promise((resolver) => {
      const url = URL.createObjectURL(imagen.blob);
      el.dlgFotoImg.src = url;
      el.dlgFotoTitulo.textContent = total > 1
        ? `Vista previa: foto ${posicion} de ${total}`
        : 'Vista previa de la foto';
      el.dlgFotoDescripcion.value = '';
      el.dlgFoto.returnValue = 'descartar';   // Esc o cierre = descartar
      el.dlgFoto.addEventListener('close', () => {
        URL.revokeObjectURL(url);
        resolver({
          confirmado: el.dlgFoto.returnValue === 'confirmar',
          descripcion: el.dlgFotoDescripcion.value.trim(),
        });
      }, { once: true });
      el.dlgFoto.showModal();
    });
  }

  async function agregarFoto(imagen, descripcion) {
    const foto = {
      id: generarId('foto'),
      proyectoId: estado.proyecto.id,
      blob: imagen.blob,
      tipo: 'image/jpeg',
      ancho: imagen.ancho,
      alto: imagen.alto,
      nombreOriginal: imagen.nombreOriginal,
      descripcion,
      orden: estado.fotos.length,
      fechaIncorporacion: new Date().toISOString(),   // fecha de la APP, no de la imagen
    };
    await BaseDatos.guardarFoto(foto);                // espera la confirmación del guardado
    estado.fotos.push(foto);
    renderTodo();
  }

  async function procesarArchivos(archivos) {
    if (!estado.proyecto) {
      mostrarMensaje('Primero guarda el proyecto.', 'aviso');
      return;
    }
    if (estado.ocupado) return;
    estado.ocupado = true;
    let guardadas = 0, descartadas = 0, fallidas = 0;

    for (let i = 0; i < archivos.length; i++) {
      try {
        const imagen = await procesarImagen(archivos[i]);
        const decision = await pedirConfirmacion(imagen, i + 1, archivos.length);
        if (decision.confirmado) {
          await agregarFoto(imagen, decision.descripcion);
          guardadas++;
        } else {
          descartadas++;
        }
      } catch (error) {
        fallidas++;
        mostrarMensaje(`No se pudo agregar "${archivos[i].name || 'la foto'}": ${textoError(error)}.`, 'error');
      }
    }
    estado.ocupado = false;

    if (guardadas) mostrarMensaje(`${guardadas} foto(s) guardada(s).`);
    if (descartadas && !guardadas && !fallidas) mostrarMensaje('No se guardó ninguna foto. Puedes seguir trabajando.', 'aviso');
  }

  function alElegirArchivos(evento) {
    const archivos = Array.from(evento.target.files || []);
    evento.target.value = '';                  // permite elegir el mismo archivo otra vez
    if (!archivos.length) {
      mostrarMensaje('No se eligió ninguna imagen. Puedes continuar.', 'aviso');
      return;
    }
    procesarArchivos(archivos);
  }

  function alCancelarSeleccion() {
    mostrarMensaje('Captura cancelada o permiso de cámara denegado. Puedes continuar o intentar de nuevo.', 'aviso');
  }

  function detenerCamara() {
    if (estado.flujoCamara) {
      estado.flujoCamara.getTracks().forEach((pista) => pista.stop());
      estado.flujoCamara = null;
    }
    el.videoCamara.srcObject = null;
    el.btnCapturar.disabled = true;
  }

  async function tomarFoto() {
    if (!estado.proyecto) {
      mostrarMensaje('Primero guarda el proyecto.', 'aviso');
      return;
    }
    if (estado.ocupado) return;

    // En celulares se conserva el selector nativo, que suele abrir la cámara trasera.
    if (window.matchMedia('(pointer: coarse)').matches) {
      el.inpCamara.click();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      mostrarMensaje('La cámara web requiere HTTPS o abrir la aplicación en localhost, y un navegador compatible.', 'error');
      return;
    }

    el.estadoCamara.textContent = 'Solicitando permiso para usar la cámara…';
    el.dlgCamara.showModal();
    try {
      estado.flujoCamara = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (!el.dlgCamara.open) {
        detenerCamara();
        return;
      }
      el.videoCamara.srcObject = estado.flujoCamara;
      await el.videoCamara.play();
      el.estadoCamara.textContent = 'Cámara activa. Encuadra la imagen y captura.';
      el.btnCapturar.disabled = false;
    } catch (error) {
      detenerCamara();
      if (!el.dlgCamara.open) return;
      el.dlgCamara.close();
      const detalle = error.name === 'NotAllowedError'
        ? 'Permite el acceso a la cámara en el navegador y en Windows.'
        : error.name === 'NotFoundError'
          ? 'No se encontró una cámara conectada.'
          : `No se pudo iniciar la cámara: ${textoError(error)}`;
      mostrarMensaje(detalle, 'error');
    }
  }

  async function capturarFotoWeb() {
    const video = el.videoCamara;
    if (!video.videoWidth || !video.videoHeight) {
      mostrarMensaje('La cámara todavía no está lista. Espera un momento e inténtalo otra vez.', 'aviso');
      return;
    }
    el.btnCapturar.disabled = true;
    try {
      const lienzo = document.createElement('canvas');
      lienzo.width = video.videoWidth;
      lienzo.height = video.videoHeight;
      const contexto = lienzo.getContext('2d');
      if (!contexto) throw new Error('No se pudo preparar la captura.');
      contexto.drawImage(video, 0, 0);
      const blob = await new Promise((resolver) => lienzo.toBlob(resolver, 'image/jpeg', CALIDAD_JPEG));
      if (!blob) throw new Error('No se pudo crear el archivo de la foto.');
      const archivo = new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' });
      el.dlgCamara.close();
      await procesarArchivos([archivo]);
    } catch (error) {
      el.btnCapturar.disabled = false;
      mostrarMensaje(`No se pudo capturar la foto: ${textoError(error)}`, 'error');
    }
  }

  /* ============================================================
     3. ORGANIZACIÓN: descripciones, mover, eliminar
     ============================================================ */
  function buscarFoto(id) {
    return estado.fotos.find((f) => f.id === id);
  }

  // Deja orden = posición en el arreglo. Devuelve las fotos que cambiaron.
  function renumerar() {
    const cambiadas = [];
    estado.fotos.forEach((foto, i) => {
      if (foto.orden !== i) { foto.orden = i; cambiadas.push(foto); }
    });
    return cambiadas;
  }

  function programarGuardadoDescripcion(id, texto) {
    const foto = buscarFoto(id);
    if (!foto) return;
    foto.descripcion = texto;
    actualizarTextoVistaPrevia(id);
    clearTimeout(estado.pendientes.get(id));
    const temporizador = setTimeout(() => {
      estado.pendientes.delete(id);
      BaseDatos.guardarFoto(foto).catch((e) =>
        mostrarMensaje(`No se pudo guardar la descripción: ${textoError(e)}`, 'error'));
    }, 500);
    estado.pendientes.set(id, temporizador);
  }

  async function guardarDescripcionAhora(id) {
    const foto = buscarFoto(id);
    if (!foto) return;
    clearTimeout(estado.pendientes.get(id));
    estado.pendientes.delete(id);
    try {
      await BaseDatos.guardarFoto(foto);
      mostrarMensaje('Descripción guardada.');
    } catch (error) {
      mostrarMensaje(`No se pudo guardar la descripción: ${textoError(error)}`, 'error');
    }
  }

  // Guarda de inmediato lo que esté esperando el temporizador
  async function guardarPendientes() {
    const ids = Array.from(estado.pendientes.keys());
    ids.forEach((id) => { clearTimeout(estado.pendientes.get(id)); estado.pendientes.delete(id); });
    const fotos = ids.map(buscarFoto).filter(Boolean);
    if (!fotos.length) return;
    try { await BaseDatos.guardarFotos(fotos); }
    catch (error) { mostrarMensaje(`No se pudieron guardar las descripciones: ${textoError(error)}`, 'error'); }
  }

  async function moverFoto(id, delta, accion) {
    const i = estado.fotos.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= estado.fotos.length) return;
    await guardarPendientes();

    [estado.fotos[i], estado.fotos[j]] = [estado.fotos[j], estado.fotos[i]];
    const cambiadas = renumerar();
    try {
      await BaseDatos.guardarFotos(cambiadas);
      renderTodo();
      const boton = el.galeria.querySelector(`li[data-id="${id}"] [data-accion="${accion}"]`);
      if (boton && !boton.disabled) boton.focus();
    } catch (error) {
      [estado.fotos[i], estado.fotos[j]] = [estado.fotos[j], estado.fotos[i]];   // deshacer
      renumerar();
      renderTodo();
      mostrarMensaje(`No se pudo mover la foto: ${textoError(error)}`, 'error');
    }
  }

  async function eliminarFoto(id) {
    const indice = estado.fotos.findIndex((f) => f.id === id);
    if (indice < 0) return;
    const etiqueta = Exportar.etiquetaFoto(indice);
    if (!(await confirmar(`¿Eliminar la ${etiqueta}? Esta acción no se puede deshacer.`))) return;

    await guardarPendientes();
    try {
      await BaseDatos.eliminarFoto(id);
      const [quitada] = estado.fotos.splice(indice, 1);
      if (estado.urls.has(quitada.id)) {
        URL.revokeObjectURL(estado.urls.get(quitada.id));
        estado.urls.delete(quitada.id);
      }
      const cambiadas = renumerar();               // la numeración se corrige sola
      if (cambiadas.length) await BaseDatos.guardarFotos(cambiadas);
      renderTodo();
      mostrarMensaje(`${etiqueta} eliminada. La numeración se actualizó.`);
    } catch (error) {
      mostrarMensaje(`No se pudo eliminar la foto: ${textoError(error)}`, 'error');
    }
  }

  /* ============================================================
     4. PINTAR LA INTERFAZ
     ============================================================ */
  function actualizarInterfaz() {
    const hayProyecto = Boolean(estado.proyecto);
    el.btnTomar.disabled = !hayProyecto;
    el.btnAgregar.disabled = !hayProyecto;
    el.btnGenerar.disabled = !hayProyecto;
    el.btnEliminarProyecto.disabled = !hayProyecto;
    el.avisoSinProyecto.hidden = hayProyecto;
    renderTodo();
  }

  function renderTodo() {
    renderGaleria();
    renderVistaPrevia();
  }

  function crearTarjeta(foto, indice, total) {
    const li = document.createElement('li');
    li.className = 'tarjeta';
    li.dataset.id = foto.id;

    const cab = document.createElement('div');
    cab.className = 'tarjeta-cab';
    const numero = document.createElement('span');
    numero.textContent = Exportar.etiquetaFoto(indice);
    const estadoDescripcion = document.createElement('span');
    estadoDescripcion.className = `estado-foto ${foto.descripcion.trim() ? 'asignada' : 'pendiente'}`;
    estadoDescripcion.textContent = foto.descripcion.trim() ? 'Descrita' : 'Pendiente';
    cab.append(numero, estadoDescripcion);

    const marco = document.createElement('div');
    marco.className = 'tarjeta-img';
    const img = document.createElement('img');
    img.src = urlDe(foto);
    img.alt = `${Exportar.etiquetaFoto(indice)}${foto.descripcion ? ': ' + foto.descripcion : ''}`;
    marco.appendChild(img);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'tarjeta-cuerpo';

    const idTexto = `desc-${foto.id}`;
    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = idTexto;
    etiqueta.textContent = 'Descripción';
    etiqueta.style.fontWeight = '600';

    const texto = document.createElement('textarea');
    texto.id = idTexto;
    texto.rows = 3;
    texto.maxLength = 500;
    texto.value = foto.descripcion;
    texto.placeholder = 'Describe lo que muestra la foto';

    const fecha = document.createElement('p');
    fecha.className = 'tarjeta-fecha';
    fecha.textContent = `Incorporada a la aplicación: ${formatoFechaHora(foto.fechaIncorporacion)}`;

    const botones = document.createElement('div');
    botones.className = 'tarjeta-botones';
    botones.append(
      crearBoton('Subir', 'subir', 'btn secundario', indice === 0, `Subir la ${Exportar.etiquetaFoto(indice)}`),
      crearBoton('Bajar', 'bajar', 'btn secundario', indice === total - 1, `Bajar la ${Exportar.etiquetaFoto(indice)}`),
      crearBoton('Eliminar', 'eliminar', 'btn peligro eliminar', false, `Eliminar la ${Exportar.etiquetaFoto(indice)}`)
    );

    cuerpo.append(etiqueta, texto, fecha, botones);
    li.append(cab, marco, cuerpo);
    return li;
  }

  function crearBoton(texto, accion, clases, desactivado, ariaLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.className = clases;
    b.dataset.accion = accion;
    b.disabled = desactivado;
    b.setAttribute('aria-label', ariaLabel);
    return b;
  }

  function renderGaleria() {
    el.galeria.innerHTML = '';
    if (!estado.fotos.length) {
      el.resumenFotos.textContent = 'Fotos registradas: 0.';
      const vacio = document.createElement('li');
      vacio.className = 'vacio';
      vacio.textContent = estado.proyecto
        ? 'Todavía no hay fotos. Usa "Tomar foto" o "Agregar imágenes".'
        : 'Las fotos del proyecto aparecerán aquí.';
      el.galeria.appendChild(vacio);
      return;
    }
    const consulta = normalizarBusqueda(el.buscarFotos.value.trim());
    const filtro = el.filtroFotos.value;
    const conDescripcion = estado.fotos.filter((foto) => foto.descripcion.trim()).length;
    const pendientes = estado.fotos.length - conDescripcion;
    const resultados = estado.fotos
      .map((foto, indice) => ({ foto, indice }))
      .filter(({ foto, indice }) => {
        const tieneDescripcion = Boolean(foto.descripcion.trim());
        if (filtro === 'descritas' && !tieneDescripcion) return false;
        if (filtro === 'pendientes' && tieneDescripcion) return false;
        if (!consulta) return true;
        const texto = normalizarBusqueda([
          Exportar.etiquetaFoto(indice),
          foto.nombreOriginal,
          foto.descripcion,
          formatoFechaHora(foto.fechaIncorporacion),
        ].join(' '));
        return texto.includes(consulta);
      });

    el.resumenFotos.textContent =
      `Registradas: ${estado.fotos.length} · Con descripción: ${conDescripcion} · Pendientes: ${pendientes} · Mostrando: ${resultados.length}`;
    if (!resultados.length) {
      const vacio = document.createElement('li');
      vacio.className = 'vacio';
      vacio.textContent = 'No se encontraron fotos con esa búsqueda o filtro.';
      el.galeria.appendChild(vacio);
      return;
    }
    const total = estado.fotos.length;
    resultados.forEach(({ foto, indice }) =>
      el.galeria.appendChild(crearTarjeta(foto, indice, total)));
  }

  function normalizarBusqueda(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE');
  }

  function renderVistaPrevia() {
    el.vistaPrevia.innerHTML = '';
    const anexo = document.createElement('div');
    anexo.className = 'anexo';

    const titulo = document.createElement('h3');
    titulo.className = 'anexo-titulo';
    titulo.textContent = 'ANEXO 2 REGISTRO FOTOGRÁFICO';
    anexo.appendChild(titulo);

    const p = estado.proyecto;
    const datos = document.createElement('div');
    datos.className = 'anexo-datos';
    [
      ['Código', p ? p.codigo : ''],
      ['Fiscalizador', p ? p.fiscalizador : ''],
      ['Lugar', p ? p.lugar : ''],
      ['Establecimiento o unidad', p ? p.establecimiento : ''],
    ].forEach(([etiqueta, valor]) => {
      const linea = document.createElement('p');
      const negrita = document.createElement('strong');
      negrita.textContent = `${etiqueta}: `;
      linea.append(negrita, document.createTextNode(valor));
      datos.appendChild(linea);
    });
    anexo.appendChild(datos);

    const tabla = document.createElement('table');
    tabla.className = 'tabla-anexo';
    const colgrupo = document.createElement('colgroup');
    colgrupo.innerHTML = '<col class="col-num"><col>';
    tabla.appendChild(colgrupo);

    const cabecera = document.createElement('thead');
    const filaCab = document.createElement('tr');
    const celdaCab = document.createElement('th');
    celdaCab.colSpan = 2;
    celdaCab.textContent = `FOTOGRAFÍAS DE FECHA ${p ? Exportar.formatoFechaLarga(p.fecha).toUpperCase() : '[DÍA MES AÑO]'}`;
    filaCab.appendChild(celdaCab);
    cabecera.appendChild(filaCab);
    tabla.appendChild(cabecera);

    const cuerpo = document.createElement('tbody');
    estado.fotos.forEach((foto, i) => {
      const filaImg = document.createElement('tr');
      const celdaImg = document.createElement('td');
      celdaImg.colSpan = 2;
      celdaImg.className = 'celda-imagen';
      const img = document.createElement('img');
      img.src = urlDe(foto);
      img.alt = Exportar.etiquetaFoto(i);
      celdaImg.appendChild(img);
      filaImg.appendChild(celdaImg);

      const filaTxt = document.createElement('tr');
      filaTxt.dataset.id = foto.id;
      const celdaNum = document.createElement('th');
      celdaNum.scope = 'row';
      celdaNum.textContent = Exportar.etiquetaFoto(i);
      const celdaDesc = document.createElement('td');
      celdaDesc.textContent = foto.descripcion;
      filaTxt.append(celdaNum, celdaDesc);

      cuerpo.append(filaImg, filaTxt);
    });
    tabla.appendChild(cuerpo);
    anexo.appendChild(tabla);

    if (!estado.fotos.length) {
      const vacio = document.createElement('p');
      vacio.className = 'nota';
      vacio.textContent = 'Aquí verás la secuencia final de fotos tal como saldrá en el Word.';
      anexo.appendChild(vacio);
    }
    el.vistaPrevia.appendChild(anexo);
  }

  function actualizarTextoVistaPrevia(id) {
    const fila = el.vistaPrevia.querySelector(`tr[data-id="${id}"]`);
    const foto = buscarFoto(id);
    if (fila && foto) fila.lastElementChild.textContent = foto.descripcion;
  }

  /* ============================================================
     5. EXPORTACIÓN A WORD
     ============================================================ */
  function ocultarProblemas() {
    el.panelProblemas.hidden = true;
    el.panelProblemas.innerHTML = '';
    el.galeria.querySelectorAll('.invalido').forEach((n) => n.classList.remove('invalido'));
  }

  function validarParaExportar() {
    const problemas = [];
    if (!estado.proyecto) {
      problemas.push({ mensaje: 'Crea o abre un proyecto.' });
      return problemas;
    }
    const datos = leerFormulario();
    validarProyecto(datos).forEach((e) => problemas.push({ mensaje: `Datos del proyecto: ${e.mensaje}` }));
    if (hayCambiosSinGuardar()) {
      problemas.push({ mensaje: 'Hay cambios sin guardar en los datos del proyecto. Pulsa "Guardar proyecto".' });
    }
    if (!estado.fotos.length) {
      problemas.push({ mensaje: 'Agrega al menos una fotografía.' });
    }
    estado.fotos.forEach((foto, i) => {
      if (!foto.descripcion.trim()) {
        problemas.push({ mensaje: `${Exportar.etiquetaFoto(i)}: falta la descripción.`, fotoId: foto.id });
      }
    });
    return problemas;
  }

  function mostrarProblemas(problemas) {
    ocultarProblemas();
    if (!problemas.length) return;
    const titulo = document.createElement('strong');
    titulo.textContent = 'No se puede generar el Word. Corrige lo siguiente:';
    const lista = document.createElement('ul');
    problemas.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.mensaje;
      lista.appendChild(li);
    });
    el.panelProblemas.append(titulo, lista);
    el.panelProblemas.hidden = false;

    problemas.filter((p) => p.fotoId).forEach((p) => {
      const caja = el.galeria.querySelector(`li[data-id="${p.fotoId}"] textarea`);
      if (caja) caja.classList.add('invalido');
    });
  }

  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function generarWord() {
    await guardarPendientes();
    const problemas = validarParaExportar();
    mostrarProblemas(problemas);
    if (problemas.length) {
      mostrarMensaje(`No se generó el Word: hay ${problemas.length} punto(s) por corregir.`, 'error');
      el.panelProblemas.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (typeof docx === 'undefined') {
      mostrarMensaje('No se cargó la biblioteca docx desde Internet. Comprueba tu conexión y recarga la página.', 'error');
      return;
    }

    el.btnGenerar.disabled = true;
    const textoOriginal = el.btnGenerar.textContent;
    el.btnGenerar.textContent = 'Generando…';
    try {
      // Cada foto se incluye una sola vez, en el orden actual de la galería
      const fotosDoc = [];
      for (const foto of estado.fotos) {
        fotosDoc.push({
          bytes: new Uint8Array(await foto.blob.arrayBuffer()),
          ancho: foto.ancho,
          alto: foto.alto,
          descripcion: foto.descripcion.trim(),
        });
      }
      const documento = Exportar.crearDocumento(estado.proyecto, fotosDoc, docx);
      const archivo = await docx.Packer.toBlob(documento);
      descargar(archivo, Exportar.nombreArchivo(estado.proyecto));
      mostrarMensaje(`Word generado con ${fotosDoc.length} foto(s).`);
    } catch (error) {
      mostrarMensaje(`No se pudo generar el Word: ${textoError(error)}`, 'error');
    } finally {
      el.btnGenerar.textContent = textoOriginal;
      el.btnGenerar.disabled = !estado.proyecto;
    }
  }

  /* ============================================================
     6. EVENTOS
     ============================================================ */
  function conectarEventos() {
    el.form.addEventListener('submit', alGuardarProyecto);
    el.selProyecto.addEventListener('change', alCambiarSelector);
    el.btnNuevo.addEventListener('click', alPulsarNuevo);
    el.btnEliminarProyecto.addEventListener('click', alEliminarProyecto);

    // Al escribir en un campo se quita su error
    el.form.addEventListener('input', (e) => {
      if (e.target.name) {
        e.target.removeAttribute('aria-invalid');
        const err = $(`#err-${e.target.name}`);
        if (err) err.textContent = '';
      }
    });

    el.btnTomar.addEventListener('click', tomarFoto);
    el.btnAgregar.addEventListener('click', () => el.inpArchivos.click());
    el.btnCapturar.addEventListener('click', capturarFotoWeb);
    el.btnCerrarCamara.addEventListener('click', () => el.dlgCamara.close());
    el.dlgCamara.addEventListener('close', detenerCamara);
    el.inpCamara.addEventListener('change', alElegirArchivos);
    el.inpArchivos.addEventListener('change', alElegirArchivos);
    el.inpCamara.addEventListener('cancel', alCancelarSeleccion);
    el.inpArchivos.addEventListener('cancel', alCancelarSeleccion);
    el.buscarFotos.addEventListener('input', renderGaleria);
    el.filtroFotos.addEventListener('change', renderGaleria);

    // Delegación de eventos: un solo oyente para todas las tarjetas
    el.galeria.addEventListener('click', (e) => {
      const boton = e.target.closest('button[data-accion]');
      if (!boton) return;
      const id = boton.closest('li').dataset.id;
      const accion = boton.dataset.accion;
      if (accion === 'subir') moverFoto(id, -1, accion);
      else if (accion === 'bajar') moverFoto(id, 1, accion);
      else if (accion === 'eliminar') eliminarFoto(id);
    });
    el.galeria.addEventListener('input', (e) => {
      if (e.target.tagName !== 'TEXTAREA') return;
      e.target.classList.remove('invalido');
      programarGuardadoDescripcion(e.target.closest('li').dataset.id, e.target.value);
    });
    el.galeria.addEventListener('change', (e) => {
      if (e.target.tagName === 'TEXTAREA') {
        guardarDescripcionAhora(e.target.closest('li').dataset.id).then(renderGaleria);
      }
    });

    el.btnGenerar.addEventListener('click', generarWord);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') guardarPendientes();
    });
  }

  /* ============================================================
     7. INICIO
     ============================================================ */
  async function iniciar() {
    conectarEventos();
    escribirFormulario(null);
    actualizarInterfaz();
    try {
      await BaseDatos.abrir();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      await cargarListaProyectos();
      const recordado = ultimoProyecto();
      const id = estado.proyectos.some((p) => p.id === recordado)
        ? recordado
        : (estado.proyectos[0] && estado.proyectos[0].id);
      if (id) await abrirProyecto(id);
      else pintarSelector();
    } catch (error) {
      mostrarMensaje(`No se pudo usar el almacenamiento del navegador: ${textoError(error)}`, 'error');
      el.btnTomar.disabled = true;
      el.btnAgregar.disabled = true;
      el.btnGenerar.disabled = true;
    }
  }

  iniciar();
})();