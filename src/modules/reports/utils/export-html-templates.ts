/**
 * HTML template generation for report exports.
 * Ported from v3 scripts/exportHtmlFunctions.ts.
 *
 * Generates self-contained HTML documents that embed:
 *   - jqxGrid (jqWidgets) for tabular data
 *   - ECharts for chart rendering (SVG renderer)
 *   - Threshold-based cell coloring
 */

import { ExportCdns } from '../../../shared/services/export-helper.service';
import { ITabularHeader, IChartData, IReportOptions } from '../dto/report-interfaces';

interface ExportTabularData {
  header: ITabularHeader[];
  body: Record<string, unknown>[];
}

/**
 * Generate a full HTML report document with table + charts.
 * Mirrors v3 exportReportHTMLScript().
 */
export function exportReportHTMLScript(
  cdns: ExportCdns,
  charts: string[],
  table: ExportTabularData,
  report: { name?: string; options?: IReportOptions | null; charts?: IChartData[] },
  isPdf = false,
): string {
  const visibleHeaders = table.header.filter((h) => !h.hidden);

  const datafields = visibleHeaders.map((h) => `{ name: '${escapeJs(h.datafield || h.text)}', type: 'string' }`);

  const columns = visibleHeaders.map(
    (h) => `{ text: '${escapeJs(h.text)}', datafield: '${escapeJs(h.datafield || h.text)}', width: 'auto' }`,
  );

  const heightStyle = isPdf ? 'height: 50rem;' : 'height: 100%;';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(report.name || 'Report Export')}</title>
  <link rel="stylesheet" href="${cdns.jqxBase}">
  <link rel="stylesheet" href="${cdns.font}">
  <style>
    body { font-family: 'Roboto', sans-serif; margin: 0; padding: 10px; background: #fff; }
    .chart-container { width: 100%; ${heightStyle} margin-bottom: 20px; }
    .table-container { width: 98%; margin: 0 auto; }
    #jqxGrid { margin-bottom: 20px; }
  </style>
  <script src="${cdns.jquery}"></script>
  <script src="${cdns.jqxCore}"></script>
  <script src="${cdns.jqxData}"></script>
  <script src="${cdns.jqxButtons}"></script>
  <script src="${cdns.jqxScrollbar}"></script>
  <script src="${cdns.jqxMenu}"></script>
  <script src="${cdns.jqxGrid}"></script>
  <script src="${cdns.jqxGridSelection}"></script>
  <script src="${cdns.jqxGridColumnsResize}"></script>
  <script src="${cdns.echarts}"></script>
</head>
<body>
  <div class="table-container">
    <div id="jqxGrid"></div>
  </div>
  ${charts.map((c, i) => `<div class="chart-container" id="chart_${i}">${c}</div>`).join('\n  ')}
  <script>
    var tableData = ${JSON.stringify(table.body)};
    var source = {
      localdata: tableData,
      datatype: "array",
      datafields: [${datafields.join(', ')}]
    };
    var dataAdapter = new $.jqx.dataAdapter(source);
    $("#jqxGrid").jqxGrid({
      width: '100%',
      autoheight: true,
      source: dataAdapter,
      columnsresize: true,
      columns: [${columns.join(', ')}]
    });
  </script>
</body>
</html>`;
}

/**
 * Generate HTML for a single chart tab export.
 * Mirrors v3 exportChartHTML().
 */
export function exportChartHTML(cdns: ExportCdns, chartHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Chart Export</title>
  <link rel="stylesheet" href="${cdns.font}">
  <style>
    body { font-family: 'Roboto', sans-serif; margin: 0; padding: 10px; background: #fff; }
    .chart-container { width: 100%; height: 100%; }
  </style>
  <script src="${cdns.echarts}"></script>
</head>
<body>
  <div class="chart-container">${chartHtml}</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}
