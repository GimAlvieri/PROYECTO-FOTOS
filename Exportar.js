/* ============================================================
   exportar.js  -  Generación del anexo fotográfico en .docx
   Usa la biblioteca "docx" cargada desde CDN en index.html.
   Formato: A4 vertical, márgenes de 2,54 cm, tabla continua de
   dos columnas, Poppins 8 pt, dos fotografías por página.
   ============================================================ */
const Exportar = (() => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const FUENTE = 'Poppins';
  const TAMANO = 16;                 // medio-puntos: 16 = 8 pt
  const PAGINA = { ancho: 11906, alto: 16838 }; // A4 en twips (1 cm = 567)
  const MARGEN = 1440;               // 2,54 cm
  const ANCHO_TABLA = PAGINA.ancho - 2 * MARGEN;   // 9026
  const COL_NUMERO = 1700;           // columna angosta (número de foto)
  const COL_DESCRIPCION = ANCHO_TABLA - COL_NUMERO;
  const CAJA_FOTO = { ancho: 570, alto: 290 };     // píxeles (96 dpi) máx. por foto
  const FOTOS_POR_PAGINA = 2;

  /* ---------- Utilidades ---------- */
  function formatoFechaLarga(textoFecha) {
    // textoFecha = "AAAA-MM-DD". Se separa a mano para evitar desfases de zona horaria.
    const [anio, mes, dia] = String(textoFecha).split('-').map(Number);
    if (!anio || !mes || !dia) return String(textoFecha);
    return `${dia} de ${MESES[mes - 1]} de ${anio}`;
  }

  function numeroFoto(indice) {
    return String(indice + 1).padStart(2, '0');
  }

  function etiquetaFoto(indice) {
    return `Foto N.º ${numeroFoto(indice)}`;
  }

  // Ajusta la foto a la caja máxima sin deformarla.
  function ajustarProporcion(ancho, alto) {
    const escala = Math.min(CAJA_FOTO.ancho / ancho, CAJA_FOTO.alto / alto, 1);
    return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
  }

  function nombreArchivo(proyecto) {
    const limpio = String(proyecto.codigo)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `Anexo_fotografico_${limpio || 'proyecto'}.docx`;
  }

  /* ---------- Construcción del documento ---------- */
  // fotos: [{ bytes: Uint8Array (JPEG), ancho, alto, descripcion }] en el orden final.
  function crearDocumento(proyecto, fotos, lib) {
    const {
      Document, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
      AlignmentType, BorderStyle, ShadingType, VerticalAlign, WidthType, TableLayoutType,
    } = lib;

    const run = (texto, opciones = {}) =>
      new TextRun({ text: texto, font: FUENTE, size: TAMANO, ...opciones });

    const linea = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    const bordes = { top: linea, bottom: linea, left: linea, right: linea };

    /* Encabezado */
    const dato = (etiqueta, valor) =>
      new Paragraph({
        spacing: { after: 40 },
        children: [run(`${etiqueta}: `, { bold: true }), run(valor)],
      });

    const encabezado = [
      new Paragraph({
        spacing: { after: 160 },
        children: [new TextRun({ text: 'ANEXO 2 REGISTRO FOTOGRÁFICO', font: FUENTE, size: 24, bold: true })],
      }),
      dato('Código', proyecto.codigo),
      dato('Fiscalizador', proyecto.fiscalizador),
      dato('Lugar', proyecto.lugar),
      dato('Establecimiento o unidad', proyecto.establecimiento),
      new Paragraph({ spacing: { after: 120 }, children: [] }),
    ];

    /* Tabla: una fila de título, y por cada foto una fila de imagen + una fila de número/descripción */
    const filas = [];

    filas.push(new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: 2,
        width: { size: ANCHO_TABLA, type: WidthType.DXA },
        borders: bordes,
        shading: { type: ShadingType.CLEAR, fill: 'D9D9D9', color: 'auto' },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 80 },
          keepNext: true,
          children: [run(`FOTOGRAFÍAS DE FECHA ${formatoFechaLarga(proyecto.fecha).toUpperCase()}`, { bold: true })],
        })],
      })],
    }));

    fotos.forEach((foto, i) => {
      const medida = ajustarProporcion(foto.ancho, foto.alto);
      const etiqueta = etiquetaFoto(i);
      const nuevaPagina = i > 0 && i % FOTOS_POR_PAGINA === 0;

      // Fila 1: imagen a todo el ancho (celda combinada)
      filas.push(new TableRow({
        cantSplit: true,
        children: [new TableCell({
          columnSpan: 2,
          width: { size: ANCHO_TABLA, type: WidthType.DXA },
          borders: bordes,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 100, bottom: 100, left: 100, right: 100 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,                 // la foto no se separa de su descripción
            pageBreakBefore: nuevaPagina,   // salto de página controlado
            children: [new ImageRun({
              type: 'jpg',
              data: foto.bytes,
              transformation: { width: medida.ancho, height: medida.alto },
              altText: { name: `foto-${numeroFoto(i)}`, title: etiqueta, description: foto.descripcion },
            })],
          })],
        })],
      }));

      // Fila 2: número a la izquierda, descripción a la derecha
      const lineas = foto.descripcion.split(/\r?\n/);
      filas.push(new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: COL_NUMERO, type: WidthType.DXA },
            borders: bordes,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [run(etiqueta, { bold: true })] })],
          }),
          new TableCell({
            width: { size: COL_DESCRIPCION, type: WidthType.DXA },
            borders: bordes,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: lineas.map((texto) => new Paragraph({ children: [run(texto)] })),
          }),
        ],
      }));
    });

    const tabla = new Table({
      width: { size: ANCHO_TABLA, type: WidthType.DXA },
      columnWidths: [COL_NUMERO, COL_DESCRIPCION],
      layout: TableLayoutType.FIXED,
      rows: filas,
    });

    return new Document({
      creator: proyecto.fiscalizador,
      title: `Anexo fotográfico ${proyecto.codigo}`,
      description: 'Registro fotográfico generado desde la aplicación de práctica.',
      styles: { default: { document: { run: { font: FUENTE, size: TAMANO } } } },
      sections: [{
        properties: {
          page: {
            size: { width: PAGINA.ancho, height: PAGINA.alto },
            margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
          },
        },
        children: [
          ...encabezado,
          tabla,
          // Word exige un párrafo después de una tabla al final del documento
          new Paragraph({ spacing: { before: 0, after: 0, line: 20 }, children: [] }),
        ],
      }],
    });
  }

  return { crearDocumento, formatoFechaLarga, numeroFoto, etiquetaFoto, nombreArchivo, ajustarProporcion };
})();

// Permite probar el módulo con Node.js (no afecta al navegador)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Exportar;
}