/**
 * ShepherdAI — Bağımlılıksız Excel (.xlsx) Üretici (xlsxWriter.js)
 *
 * Saf fonksiyon: çok sayfalı bir çalışma kitabını Office Open XML biçiminde üretir ve sıkıştırmasız (STORE)
 * ZIP olarak paketler (tarayıcı destekliyorsa CompressionStream ile sıkıştırır). Harici kütüphane ve internet gerektirmez.
 *
 * Hücre değerleri: sayı → sayı hücresi; 'YYYY-MM-DD' → Excel tarihi; boolean → "Evet"/"Hayır";
 * diğerleri → metin. Başlık satırı kalın ve dondurulmuş, sütunlara filtre eklenir.
 */

const enc = new TextEncoder();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CELL_TEXT = 32767;
const STYLE = { default: 0, header: 1, date: 2, wrap: 3 };

// ── ZIP (STORE) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** files: [{ name, data, stored? }] — stored verilirse sıkıştırılmış içerik (deflate-raw) kullanılır */
function _zip(files, date = new Date()) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach(({ name, data, stored }) => {
    const nameBytes = enc.encode(name);
    const crc = crc32(data);
    const body = stored || data;
    const method = stored ? 8 : 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);         // sürüm
    local.setUint16(6, 0x0800, true);     // UTF-8 dosya adı
    local.setUint16(8, method, true);     // 0: STORE, 8: DEFLATE
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, method, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  });

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  parts.forEach(p => { out.set(p, pos); pos += p.length; });
  return out;
}

// ── XML ──
function _xml(text) {
  return String(text)
    // XML 1.0'da geçersiz kontrol karakterleri atılır
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _colName(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 'YYYY-MM-DD' → Excel seri günü (1900 tarih sistemi) */
export function excelDateSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
}

function _cell(ref, value, header = false) {
  if (value === null || value === undefined || value === '') return '';
  if (header) return `<c r="${ref}" t="inlineStr" s="${STYLE.header}"><is><t xml:space="preserve">${_xml(value)}</t></is></c>`;
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') value = value ? 'Evet' : 'Hayır';
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 1900) {
      return `<c r="${ref}" s="${STYLE.date}"><v>${excelDateSerial(value)}</v></c>`;
    }
  }
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (text.length > MAX_CELL_TEXT) text = text.slice(0, MAX_CELL_TEXT - 1) + '…';
  const style = text.includes('\n') ? ` s="${STYLE.wrap}"` : '';
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${_xml(text)}</t></is></c>`;
}

function _sheetXml(sheet) {
  const headers = sheet.columns.map(c => c.header);
  const rows = sheet.rows || [];
  const widths = sheet.columns.map((c, i) => {
    if (c.width) return c.width;
    const longest = rows.slice(0, 200).reduce((m, r) => {
      const v = r[i];
      const len = v === null || v === undefined ? 0 : ISO_DATE.test(String(v)) ? 10 : String(typeof v === 'object' ? JSON.stringify(v) : v).length;
      return Math.max(m, len);
    }, String(headers[i]).length);
    return Math.min(Math.max(longest + 2, 8), 60);
  });

  const lastCol = _colName(Math.max(headers.length - 1, 0));
  const lastRow = rows.length + 1;
  const sheetRows = [
    `<row r="1">${headers.map((h, i) => _cell(`${_colName(i)}1`, h, true)).join('')}</row>`,
    ...rows.map((r, ri) => `<row r="${ri + 2}">${headers.map((_, ci) => _cell(`${_colName(ci)}${ri + 2}`, r[ci])).join('')}</row>`)
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${sheetRows}</sheetData>
${rows.length && headers.length ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : ''}
</worksheet>`;
}

/** Excel sayfa adı kuralları: ≤ 31 karakter, []:*?/\ yok, benzersiz */
function _sheetNames(sheets) {
  const used = new Set();
  return sheets.map(s => {
    let base = String(s.name || 'Sayfa').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sayfa';
    let name = base;
    let i = 2;
    while (used.has(name.toLocaleLowerCase('tr-TR'))) {
      const suffix = ` (${i++})`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLocaleLowerCase('tr-TR'));
    return name;
  });
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5D50"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * @param {Array<{ name: string, columns: Array<{ header: string, width?: number }>, rows: Array<Array<any>> }>} sheets
 * @returns {Uint8Array} .xlsx dosya içeriği
 */
export function buildXlsx(sheets) {
  return _zip(_xlsxParts(sheets).map(f => ({ name: f.name, data: enc.encode(f.text) })));
}

async function _deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Sıkıştırılmış .xlsx (tarayıcı CompressionStream destekliyorsa; yoksa sıkıştırmasız).
 * @returns {Promise<Uint8Array>}
 */
export async function buildXlsxCompressed(sheets) {
  const parts = _xlsxParts(sheets).map(f => ({ name: f.name, data: enc.encode(f.text) }));
  if (typeof CompressionStream === 'undefined') return _zip(parts);
  try {
    for (const part of parts) part.stored = await _deflateRaw(part.data);
  } catch (e) {
    parts.forEach(part => { delete part.stored; });
  }
  return _zip(parts);
}

function _xlsxParts(sheets) {
  const list = sheets.length ? sheets : [{ name: 'Sayfa', columns: [{ header: '' }], rows: [] }];
  const names = _sheetNames(list);
  const files = [
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews>
<sheets>${names.map((n, i) => `<sheet name="${_xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { name: 'xl/styles.xml', text: STYLES_XML },
    ...list.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: _sheetXml(s) }))
  ];
  return files;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
