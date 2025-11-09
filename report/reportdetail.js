// Popup action event types
const reportUpdated = 'reportUpdated'

const params = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});

let strategyID = params.strategyID;
var reportDetailData = [], reportDetailDataCSV = []
var $table = $('#table')

// update non-functional UI components for free/plus users
updateUserUI();

function parseAmount(str) {
  if (!str) return 0;

  // 1. 替换非标准负号为标准 "-"
  let normalized = str.replace(/[−–—]/g, "-");

  // 2. 去掉美元符号、USD、逗号、空格等
  let cleaned = normalized.replace(/[\$,USD\s]/g, "");

  // 3. 解析为浮点数并保留两位小数
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  return parseFloat(num.toFixed(2));
}

// 处理百分比（去掉 %），转为 0~1 区间，保留 4 位小数
function parsePercent(str) {
  if (!str) return 0;

  // 1. 替换非标准负号为标准 "-"
  let normalized = str.replace(/[−–—]/g, "-");

  // 2. 去掉百分号、逗号、空格（注意不要去掉 -）
  let cleaned = normalized.replace(/[%\s,]/g, "");

  // 3. 解析
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;

  // 4. 转换为小数并保留四位小数
  return parseFloat((num / 100).toFixed(4));
}


function parseInteger(str) {
  if (!str) return 0;
  // 去掉逗号和空格
  let cleaned = str.replace(/[,\s]/g, "");
  return parseInt(cleaned, 10);
}

let charts = []; // 存放所有 chart 实例，方便联动

const hoverLinePlugin = {
  id: 'hoverLine',
  afterDatasetsDraw(chart) {
    const pluginOptions = chart.options?.plugins?.hoverLine;
    if (!pluginOptions?.enabled) {
      return;
    }

    const activeElements = chart.tooltip?.getActiveElements?.();
    if (!activeElements?.length) {
      return;
    }

    const { ctx, chartArea } = chart;
    const { top, bottom, left, right } = chartArea;
    const activeElement = activeElements[0]?.element;
    const y = activeElement?.y;
    if (typeof y !== 'number') {
      return;
    }

    const rawValue =
      activeElement.$context?.parsed?.y ?? activeElement.$context?.raw;
    const formatter = pluginOptions.formatter;
    const valueText = formatter ? formatter(rawValue) : rawValue;
    if (valueText === undefined || valueText === null || valueText === '') {
      return;
    }

    ctx.save();
    const strokeStyle = pluginOptions.color || 'rgba(52, 73, 94, 0.8)';
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = pluginOptions.lineWidth || 1;
    const dash = pluginOptions.dash ?? [4, 4];
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const fontSize = pluginOptions.fontSize || Chart.defaults.font.size || 12;
    const fontFamily =
      pluginOptions.fontFamily || Chart.defaults.font.family || 'sans-serif';
    ctx.font = `${fontSize}px ${fontFamily}`;
    const padding = 4;
    const textWidth = ctx.measureText(valueText).width;
    const labelWidth = textWidth + padding * 2;
    const labelHeight = fontSize + padding * 2;
    let labelX = right - labelWidth - 4;
    if (labelX < left + 4) {
      labelX = left + 4;
    }
    let labelY = y - labelHeight / 2;
    if (labelY < top + 4) {
      labelY = top + 4;
    }
    if (labelY + labelHeight > bottom - 4) {
      labelY = bottom - labelHeight - 4;
    }

    ctx.fillStyle = pluginOptions.backgroundColor || 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = pluginOptions.borderColor || strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(labelX, labelY, labelWidth, labelHeight);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pluginOptions.textColor || '#2c3e50';
    ctx.textBaseline = 'middle';
    ctx.fillText(valueText, labelX + padding, labelY + labelHeight / 2);

    ctx.restore();
  }
};

Chart.register(hoverLinePlugin);

function drawCharts(data) {
  // 销毁旧实例防止重复渲染
  charts.forEach(chart => chart.destroy?.());
  charts = [];

  const labels = data.map(item => item.parameters);

  const chartProfit = new Chart(
    document.getElementById('chartProfit').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '总盈亏百分比',
            data: data.map(item => parseFloat(item.netProfitPercent)),
            borderWidth: 2,
          }
        ]
      },
      options: baseChartOptions('总盈亏 (%)', '百分比', true)
    }
  );

  // 胜率
  const winrateValues = data.map(item => parseFloat(item.percentProfitable));
  const minWin = Math.min(...winrateValues);
  const maxWin = Math.max(...winrateValues);

  // 多留 10% 缓冲
  const winrateRange = {
    min: minWin * 0.99,
    max: maxWin * 1.01
  };

  const chartWinrate = new Chart(
    document.getElementById('chartWinrate').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '胜率',
            data: winrateValues,
            borderWidth: 2,
          }
        ]
      },
      options: baseChartOptions('胜率 (%)', '百分比', true, winrateRange)
    }
  );

  // 最大回撤
  const drawdownValues = data.map(item => parseFloat(item.maxDrawdownPercent));
  const minDrawdown = Math.min(...drawdownValues);
  const maxDrawdown = Math.max(...drawdownValues);

  const drawdownRange = {
    min: minDrawdown * 0.9,
    max: maxDrawdown * 1.1
  };

  const chartDrawdown = new Chart(
    document.getElementById('chartDrawdown').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '最大回撤百分比',
            data: drawdownValues,
            borderWidth: 2,
          }
        ]
      },
      options: baseChartOptions('最大回撤 (%)', '百分比', true, drawdownRange)
    }
  );

  // 2️⃣ 总交易数
  const chartTrades = new Chart(
    document.getElementById('chartTrades').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '总交易数',
            data: data.map(item => item.closedTrades),
            borderWidth: 2,
          }
        ]
      },
      options: baseChartOptions('总交易数', '交易数')
    }
  );

  // 4️⃣ 单笔平均盈亏金额
  const chartAvgTrade = new Chart(
    document.getElementById('chartAvgTrade').getContext('2d'),
    {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '单笔平均盈亏金额',
            data: data.map(item => parseFloat(item.averageTradeAmount)),
            borderWidth: 2,
          }
        ]
      },
      options: baseChartOptions('单笔平均盈亏金额', '金额')
    }
  );

  charts = [chartProfit, chartDrawdown, chartTrades, chartWinrate, chartAvgTrade];
}

function formatHoverValue(value, isPercent) {
  if (value === null || value === undefined) {
    return '';
  }

  let candidate = value;
  if (typeof candidate === 'object') {
    if (candidate.y !== undefined) {
      candidate = candidate.y;
    } else if (candidate.value !== undefined) {
      candidate = candidate.value;
    } else if (candidate.raw !== undefined) {
      candidate = candidate.raw;
    } else {
      const valueOf = candidate.valueOf?.();
      candidate = valueOf !== candidate ? valueOf : candidate.toString?.();
    }
  }

  const num = Number(candidate);
  if (!Number.isFinite(num)) {
    return String(candidate ?? '');
  }
  if (isPercent) {
    return (num * 100).toFixed(2) + '%';
  }
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return num.toFixed(2);
}

function baseChartOptions(title, yLabel, isPercent = false, minMax = null) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text: title
      },
      hoverLine: {
        enabled: true,
        formatter: value => formatHoverValue(value, isPercent)
      }
    },
    scales: {
      x: {
        title: { display: true, text: '参数组合' }
      },
      y: {
        beginAtZero: minMax ? false : true, // 如果手动设范围，就不用强制从 0 开始
        suggestedMin: minMax ? minMax.min : undefined,
        suggestedMax: minMax ? minMax.max : undefined,
        title: { display: true, text: yLabel },
        ticks: isPercent
          ? {
              callback: value => (value * 100).toFixed(0) + '%'
            }
          : {}
      }
    }
  };
}



function enableChartLinking() {
  charts.forEach(chart => {
    chart.options.onHover = (evt, activeEls) => {
      if (activeEls.length) {
        const index = activeEls[0].index;
        charts.forEach(c => {
          if (c !== chart) {
            c.setActiveElements([{ datasetIndex: 0, index }]);
            c.tooltip.setActiveElements([{ datasetIndex: 0, index }], {
              x: 0,
              y: 0
            });
            c.update();
          }
        });
      }
    };
  });
}


// Message handling
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const properties = Object.keys(message);
    const values = Object.values(message);

    // popupAction type defines popup html UI actions according to event type
    if (properties[0] === 'popupAction') {
      const popupAction = values[0];

      switch (popupAction.event) {
        case reportUpdated:
          if (popupAction.message.report.strategyID != strategyID){
            // omit if strategyId does not match 
            break;
          }
          for (const [key, value] of Object.entries(popupAction.message.report.reportData)) {            
            let total = parseAmount(value.netProfit.amount);
            let trades = parseInteger(value.closedTrades);
            let reportDetail = {
              "parameters": key,
              "netProfitAmount": parseAmount(value.netProfit.amount),
              "netProfitPercent": parsePercent(value.netProfit.percent),
              "maxDrawdownAmount": parseAmount(value.maxDrawdown.amount),
              "maxDrawdownPercent": parsePercent(value.maxDrawdown.percent),
              "closedTrades": parseInteger(value.closedTrades),
              "percentProfitable": parsePercent(value.percentProfitable),
              "profitFactor": value.profitFactor,
              "averageTradeAmount": trades > 0 ? (total / trades).toFixed(2) : 0,
              "averageTradePercent": parsePercent(value?.averageTrade.percent),
              "avgerageBarsInTrades": value?.avgerageBarsInTrades,
            }
            let reportDetailCSV = { ...reportDetail }
            value.detailedParameters.forEach((element, index) => {
              index += 1
              reportDetail['parameter' + index] = element.value
              reportDetailCSV[element.name] = element.value
            });
            reportDetailData.push(reportDetail)
            reportDetailDataCSV.push(reportDetailCSV)

            $table.bootstrapTable('removeByUniqueId', key);
            $table.bootstrapTable('prepend', reportDetail)

            let $newRow = $table.find(`tr[data-uniqueid="${key}"]`);
            $newRow.addClass('new-row-highlight');

          }
          break;

      }
    }
  })();

  return false;
});

chrome.storage.local.get("report-data-" + strategyID, function (item) {
  var timePeriodValue = Object.values(item)[0].timePeriod
  var values = Object.values(item)[0].reportData
  
  var detailedParameters = Object.values(values)[0].detailedParameters
  var timePeriod = document.querySelector("#timePeriod")
  timePeriod.textContent = timePeriodValue
  let isDeprecatedReportData = false;

  for (const [key, value] of Object.entries(values)) {
    if (value.averageTrade != null && value.averageTrade.amount != 0) {
      isDeprecatedReportData = true; // meaning it's old report data structure
    }

    let total = parseAmount(value.netProfit.amount);
    let trades = parseInteger(value.closedTrades);

    let reportDetail = {
      "parameters": key,
      "netProfitAmount": parseAmount(value.netProfit.amount),
      "netProfitPercent": parsePercent(value.netProfit.percent),
      "maxDrawdownAmount": parseAmount(value.maxDrawdown.amount),
      "maxDrawdownPercent": parsePercent(value.maxDrawdown.percent),
      "closedTrades": parseInteger(value.closedTrades),
      "percentProfitable": parsePercent(value.percentProfitable),
      "profitFactor": value.profitFactor,
      "averageTradeAmount": trades > 0 ? (total / trades).toFixed(2) : 0,
      "averageTradePercent": parsePercent(value?.averageTrade.percent),
      "avgerageBarsInTrades": value?.avgerageBarsInTrades,
    }
    let reportDetailCSV = { ...reportDetail }
    value.detailedParameters.forEach((element, index) => {
      index += 1
      reportDetail['parameter' + index] = element.value
      reportDetailCSV[element.name] = element.value
    });
    reportDetailData.push(reportDetail)
    reportDetailDataCSV.push(reportDetailCSV)
  }
  $table.bootstrapTable('showLoading')

  if (!isDeprecatedReportData) {
    // new report data doesn't have those values
    // $table.bootstrapTable('hideColumn', 'averageTradeAmount');
    $table.bootstrapTable('hideColumn', 'averageTradePercent');
    $table.bootstrapTable('hideColumn', 'avgerageBarsInTrades');
  }

  const updateChartsFromTable = () => {
    const sortedData = $table.bootstrapTable('getData', false);
    drawCharts(sortedData);
    enableChartLinking();
  };

  setTimeout(() => {
    $table.bootstrapTable('load', reportDetailData)
    $table.bootstrapTable('hideLoading')
    hideDropDownParameters()
    detailedParameters.forEach((detailedParameter, index) => {
      let parameterName = `parameter${index + 1}`
      $table.bootstrapTable('showColumn', parameterName);
      $table.bootstrapTable('updateColumnTitle', {
        field: parameterName,
        title: detailedParameter.name
      })
      // update drop down parameter names accordingly and make them visible again
      document.querySelector(`input[data-field='${parameterName}']`).nextElementSibling.innerText = detailedParameter.name
      document.querySelector(`input[data-field='${parameterName}']`).parentElement.style.display = 'block'
    });
    drawCharts(reportDetailData);
    enableChartLinking();
  }, 250);

  $table.on('post-body.bs.table', updateChartsFromTable);
  const $downloadReportButton = $('#download-report')

  $downloadReportButton.click(function () {
    downloadCSVReport(reportDetailDataCSV)
  })
});

// hides all drop down parameters initially
function hideDropDownParameters() {
  var dropdownLabels = document.querySelectorAll(".dropdown-menu-right label")
  for (let i = 0; i < dropdownLabels.length; i++) {
    var label = dropdownLabels[i]
    // omit all parameters columnn
    if (label.querySelector("input").getAttribute("data-field") == 'parameters') {
      continue;
    }
    // hide parameters on initial phase
    if (label.querySelector("input").getAttribute("data-field").startsWith("parameter")) {
      label.style.display = 'none'
    }
  }
}

// non-functional UI changes made with storage
function updateUserUI() {
  chrome.storage.local.get("isPlusUser", ({ isPlusUser }) => {
    if (isPlusUser) {
      // show plus logo
      var logo = document.getElementById("normalLogo")
      logo.style.cssText = 'display:none !important';
      var plusLogo = document.getElementById("plusLogo")
      plusLogo.style.cssText = 'display:block !important'
      // remove plus upgrade button 
      var plusUpgrade = document.getElementById("plusUpgrade")
      plusUpgrade.style.display = 'none'
    } else {
      // hide plus logo
      var plusLogo = document.getElementById("plusLogo")
      plusLogo.style.cssText = 'display:none !important'
      var logo = document.getElementById("normalLogo")
      logo.style.cssText = 'display:block !important';
      // add plus upgrade button 
      var plusUpgrade = document.getElementById("plusUpgrade")
      plusUpgrade.style.display = 'block'
    }
  });
}

function downloadCSVReport(reportDetailData) {
  const csv = convertReportToCSV(reportDetailData)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `report-${strategyID}.csv`);

  link.click();
}

function convertReportToCSV(reportDetailData) {
  // 字段名和中文标题的映射
  const headerMap = {
    parameters: "参数组合",
    netProfitAmount: "总盈亏金额",
    netProfitPercent: "总盈亏百分比",
    maxDrawdownAmount: "最大回撤金额",
    maxDrawdownPercent: "最大回撤百分比",
    closedTrades: "总交易数",
    percentProfitable: "盈利交易数占比",
    profitFactor: "盈利因子",
    averageTradeAmount: "单笔平均盈亏金额",
    averageTradePercent: "单笔平均盈亏百分比",
    avgerageBarsInTrades: "单笔平均持仓K线数"
  };

  const keys = Object.keys(reportDetailData[0]);


  // 生成中文表头
  let result = keys.map(key => headerMap[key] || key).join(",") + "\n";
  for (var i = 0; i < reportDetailData.length; i++) {
    var line = [];
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var value = reportDetailData[i][key];

      
      if (key === "averageTradeAmount") {
        const total = parseFloat(reportDetailData[i]["netProfitAmount"]);
        const trades = parseInteger(reportDetailData[i]["closedTrades"]);
        value = trades > 0 ? (total / trades).toFixed(2) : 0;
      }

      // Enclose the value with "" if contains comma, to preserve format
      if (typeof value === 'string' && value.indexOf(',') !== -1) {
        value = '"' + value + '"';
      }
      line.push(value);
    }
    result += line.join(",") + "\n";
  }
  return result;
}

// CustomSort function to handle non numeric chars and dash/hyphen confusion
function customSort(sortName, sortOrder, data) {
  var order = sortOrder === 'desc' ? -1 : 1
  data.sort(function (a, b) {
    var aa = ""
    var bb = ""
    if (typeof a[sortName] === 'number' && typeof b[sortName] === 'number') {
      aa = a[sortName];
      bb = b[sortName];
    } else {
      // Check if number is negative with regex, rebuild and remove non-numeric chars
      if (a[sortName].charAt(0).match(/\D/) != null && a[sortName].charAt(0) != '+') {
        aa = '-' + a[sortName].substring(1, a[sortName].length)
        aa = +((aa + '').replace(/[^0-9.-]+/g, ""))
      } else {
        aa = +((a[sortName] + '').replace(/[^0-9.-]+/g, ""))
      }

      if (b[sortName].charAt(0).match(/\D/) != null && b[sortName].charAt(0) != '+') {
        bb = '-' + b[sortName].substring(1, b[sortName].length)
        bb = +((bb + '').replace(/[^0-9.-]+/g, ""))
      } else {
        bb = +((b[sortName] + '').replace(/[^0-9.-]+/g, ""))
      }
    }

    if (aa < bb) {
      return order * -1
    }
    if (aa > bb) {
      return order
    }
    return 0
  })
}
