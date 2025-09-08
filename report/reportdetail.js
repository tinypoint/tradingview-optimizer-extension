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
  let cleaned = str.replace(/[,$USD\s]/g, "");
  return parseFloat(cleaned).toFixed(2);
}

// 处理百分比（去掉 %），转为 0~1 区间，保留 4 位小数
function parsePercent(str) {
  if (!str) return 0;
  let cleaned = str.replace(/[%\s]/g, "");
  return (parseFloat(cleaned) / 100).toFixed(4);
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
            let trades = parseInt(value.closedTrades) || 0;
            let reportDetail = {
              "parameters": key,
              "netProfitAmount": parseAmount(value.netProfit.amount),
              "netProfitPercent": parsePercent(value.netProfit.percent),
              "maxDrawdownAmount": parseAmount(value.maxDrawdown.amount),
              "maxDrawdownPercent": parsePercent(value.maxDrawdown.percent),
              "closedTrades": value.closedTrades,
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
    let trades = parseInt(value.closedTrades) || 0;

    let reportDetail = {
      "parameters": key,
      "netProfitAmount": parseAmount(value.netProfit.amount),
      "netProfitPercent": parsePercent(value.netProfit.percent),
      "maxDrawdownAmount": parseAmount(value.maxDrawdown.amount),
      "maxDrawdownPercent": parsePercent(value.maxDrawdown.percent),
      "closedTrades": value.closedTrades,
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
  }, 250);
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
        const trades = parseInt(reportDetailData[i]["closedTrades"]) || 0;
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

    if (aa < bb) {
      return order * -1
    }
    if (aa > bb) {
      return order
    }
    return 0
  })
}
