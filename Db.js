/* ============================================================
   db.js  -  Almacenamiento en IndexedDB
   Dos almacenes:
     - proyectos: { id, codigo, fecha, lugar, fiscalizador, establecimiento, creado, modificado }
     - fotos:     { id, proyectoId, blob, tipo, ancho, alto, nombreOriginal,
                    descripcion, orden, fechaIncorporacion }
   La imagen se guarda como Blob (no como ruta ni URL temporal).
   Cada función espera a que la transacción termine (oncomplete)
   antes de resolver: así "guardado" significa guardado de verdad.
   ============================================================ */
const BaseDatos = (() => {
  const NOMBRE = 'registro_fotografico_db';
  const VERSION = 1;
  let db = null;

  function abrir() {
    return new Promise((resolver, rechazar) => {
      if (!('indexedDB' in window)) {
        rechazar(new Error('Este navegador no admite IndexedDB.'));
        return;
      }
      const peticion = indexedDB.open(NOMBRE, VERSION);

      peticion.onupgradeneeded = () => {
        const base = peticion.result;
        base.createObjectStore('proyectos', { keyPath: 'id' });
        const fotos = base.createObjectStore('fotos', { keyPath: 'id' });
        fotos.createIndex('porProyecto', 'proyectoId', { unique: false });
      };
      peticion.onsuccess = () => {
        db = peticion.result;
        resolver(db);
      };
      peticion.onerror = () => rechazar(peticion.error || new Error('No se pudo abrir la base de datos.'));
      peticion.onblocked = () => rechazar(new Error('La base de datos está bloqueada por otra pestaña.'));
    });
  }

  // Ejecuta "trabajo(tx)" dentro de una transacción y resuelve al terminar.
  // Si trabajo devuelve una IDBRequest, se entrega su resultado.
  function transaccion(almacenes, modo, trabajo) {
    return new Promise((resolver, rechazar) => {
      const tx = db.transaction(almacenes, modo);
      const salida = trabajo(tx);
      tx.oncomplete = () => resolver(salida instanceof IDBRequest ? salida.result : salida);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error || new Error('La operación fue cancelada.'));
    });
  }

  /* ---------- Proyectos ---------- */
  function guardarProyecto(proyecto) {
    return transaccion('proyectos', 'readwrite', (tx) => {
      tx.objectStore('proyectos').put(proyecto);
    });
  }

  function listarProyectos() {
    return transaccion('proyectos', 'readonly', (tx) => tx.objectStore('proyectos').getAll());
  }

  function obtenerProyecto(id) {
    return transaccion('proyectos', 'readonly', (tx) => tx.objectStore('proyectos').get(id));
  }

  // Borra el proyecto y TODAS sus fotos en una sola transacción.
  function eliminarProyecto(id) {
    return transaccion(['proyectos', 'fotos'], 'readwrite', (tx) => {
      tx.objectStore('proyectos').delete(id);
      const almacenFotos = tx.objectStore('fotos');
      const claves = almacenFotos.index('porProyecto').getAllKeys(IDBKeyRange.only(id));
      claves.onsuccess = () => claves.result.forEach((clave) => almacenFotos.delete(clave));
    });
  }

  /* ---------- Fotos ---------- */
  function guardarFotos(lista) {
    return transaccion('fotos', 'readwrite', (tx) => {
      const almacen = tx.objectStore('fotos');
      lista.forEach((foto) => almacen.put(foto));
    });
  }

  function guardarFoto(foto) {
    return guardarFotos([foto]);
  }

  // Solo las fotos del proyecto indicado, ya ordenadas.
  async function listarFotos(proyectoId) {
    const fotos = await transaccion('fotos', 'readonly', (tx) =>
      tx.objectStore('fotos').index('porProyecto').getAll(IDBKeyRange.only(proyectoId))
    );
    return fotos.sort((a, b) => a.orden - b.orden);
  }

  function eliminarFoto(id) {
    return transaccion('fotos', 'readwrite', (tx) => {
      tx.objectStore('fotos').delete(id);
    });
  }

  return {
    abrir,
    guardarProyecto, listarProyectos, obtenerProyecto, eliminarProyecto,
    guardarFoto, guardarFotos, listarFotos, eliminarFoto,
  };
})();