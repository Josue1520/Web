const escape = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );

export function spreadsheet(result) {
  const cell = (v) =>
    `<Cell><Data ss:Type="${typeof v === "number" ? "Number" : "String"}">${escape(v)}</Data></Cell>`;
  const rows = [
    [result.title],
    [`Período: ${result.from} a ${result.to}`],
    result.columns,
    ...result.rows,
  ]
    .map((row) => `<Row>${row.map(cell).join("")}</Row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Reporte"><Table>${rows}</Table></Worksheet></Workbook>`;
}
