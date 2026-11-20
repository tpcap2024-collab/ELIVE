var PLAN_CONFIG = {
  MASTER_SHEET: 'Master Plan',
  PLAN_SHEET: 'Plan',
  ACTUAL_SHEET: 'Actual data',
  MASTER_COLUMNS: 11,
  PLAN_COLUMNS: 16,
  FIRST_DATA_ROW: 2,
  TIMEZONE: 'Asia/Bangkok',
  CODE_PREFIX: 'A',
  CODE_DIGITS: 4,
  MAX_PERIOD_DAYS: 366,
  MAX_CREATE_ROWS: 5000,
  WORKING_DAYS: [1, 2, 3, 4, 5, 6],
  REMARK_REGULAR: 'REGULAR',
  REMARK_EXTRA: 'EXTRA',
  REMARK_CANCEL: 'CANCEL'
};

function clearGpsPlanCacheAfterMutation_() {
  if (typeof clearTodayInboundPlanCache_ === 'function') clearTodayInboundPlanCache_();
}

/* =========================================================
 * MASTER PLAN AND UPLOADED TEMPLATE
 * ======================================================= */

function getMasterPlanData() {
  var sheet = getPlanSpreadsheet_().getSheetByName(PLAN_CONFIG.MASTER_SHEET);
  if (!sheet) throw new Error('ไม่พบชีต Master Plan');

  var lastRow = sheet.getLastRow();
  if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) {
    return {
      success: true,
      source: 'master-plan',
      sheetName: PLAN_CONFIG.MASTER_SHEET,
      rowCount: 0,
      rows: [],
      validationErrors: []
    };
  }

  if (sheet.getLastColumn() < PLAN_CONFIG.MASTER_COLUMNS) {
    throw new Error('Master Plan ต้องมีอย่างน้อย 11 คอลัมน์ A ถึง K');
  }

  var values = sheet.getRange(
    PLAN_CONFIG.FIRST_DATA_ROW,
    1,
    lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
    PLAN_CONFIG.MASTER_COLUMNS
  ).getDisplayValues();

  return validateTemplateRows_(values, 'master-plan', PLAN_CONFIG.FIRST_DATA_ROW);
}

function normalizeUploadedTemplateRows_(templateRows) {
  if (!Array.isArray(templateRows)) throw new Error('templateRows must be an array.');
  if (templateRows.length === 0) throw new Error('ไฟล์อัปโหลดไม่มีข้อมูล Plan');

  var values = [];
  for (var index = 0; index < templateRows.length; index += 1) {
    var item = templateRows[index];

    if (Array.isArray(item)) {
      values.push(item.slice(0, PLAN_CONFIG.MASTER_COLUMNS));
      continue;
    }

    if (!item || typeof item !== 'object') {
      values.push([]);
      continue;
    }

    values.push([
      item.route,
      item.company,
      item.truckName,
      item.truckType,
      item.driverName,
      item.telDriver,
      item.project,
      item.dropPoint,
      item.planEta,
      item.planEtd,
      item.groupCode
    ]);
  }

  return validateTemplateRows_(values, 'uploaded-file', 2);
}

function validateTemplateRows_(values, source, firstDisplayRow) {
  var rows = [];
  var validationErrors = [];

  for (var index = 0; index < values.length; index += 1) {
    var displayRow = firstDisplayRow + index;
    var row = normalizeTemplateRow_(values[index], displayRow);
    if (isTemplateRowEmpty_(row)) continue;

    var errors = validateTemplateRow_(row);
    if (errors.length > 0) {
      validationErrors.push({ sheetRow: displayRow, errors: errors });
    }
    rows.push(row);
  }

  return {
    success: validationErrors.length === 0,
    source: source,
    sheetName: source === 'master-plan' ? PLAN_CONFIG.MASTER_SHEET : 'Uploaded File',
    rowCount: rows.length,
    rows: rows,
    validationErrors: validationErrors
  };
}

/* =========================================================
 * CREATE PLAN BY PERIOD
 * ======================================================= */

function previewPlanPeriod(startDateText, endDateText, workingDays, source, templateRows) {
  var prepared = preparePlanPeriodData_(
    startDateText,
    endDateText,
    workingDays,
    source,
    templateRows
  );
  var codeRange = calculateCodeRunRange_(prepared.newRows.length);

  return {
    success: true,
    source: prepared.source,
    startDate: prepared.startDateText,
    endDate: prepared.endDateText,
    calendarDayCount: prepared.calendarDayCount,
    workingDateCount: prepared.planDates.length,
    workingDays: prepared.workingDays,
    workingDayLabels: getWorkingDayLabels_(prepared.workingDays),
    masterPlanRowCount: prepared.template.rows.length,
    totalCandidateRows: prepared.candidateRows.length,
    duplicateRowCount: prepared.duplicateRows.length,
    newRowCount: prepared.newRows.length,
    currentMaximumCodeRun: codeRange.currentMaximumCodeRun,
    startCodeRun: codeRange.startCodeRun,
    endCodeRun: codeRange.endCodeRun,
    duplicateHandling: 'SKIP',
    message: 'Preview สำเร็จ ยังไม่มีการเขียนข้อมูลลงชีต Plan'
  };
}

function createPlanPeriod(startDateText, endDateText, workingDays, source, templateRows) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังสร้าง Plan กรุณารอสักครู่แล้วลองใหม่');
  }

  var startedAt = Date.now();
  try {
    var sheet = getPlanSheet_();
    var prepared = preparePlanPeriodData_(
      startDateText,
      endDateText,
      workingDays,
      source,
      templateRows
    );

    if (prepared.newRows.length === 0) {
      return {
        success: true,
        source: prepared.source,
        createdRowCount: 0,
        duplicateRowCount: prepared.duplicateRows.length,
        totalCandidateRows: prepared.candidateRows.length,
        startCodeRun: '-',
        endCodeRun: '-',
        firstOutputRow: null,
        lastOutputRow: null,
        durationMs: Date.now() - startedAt,
        message: 'ไม่มีรายการใหม่ ข้อมูลทั้งหมดมีอยู่ในชีต Plan แล้ว'
      };
    }

    if (prepared.newRows.length > PLAN_CONFIG.MAX_CREATE_ROWS) {
      throw new Error('จำนวนรายการเกินขีดจำกัด ' + PLAN_CONFIG.MAX_CREATE_ROWS + ' แถว');
    }

    var codeNumbers = generateNextCodeNumbers_(
      getUsedCodeRunNumbers_(),
      prepared.newRows.length
    );
    var outputRows = [];

    for (var index = 0; index < prepared.newRows.length; index += 1) {
      outputRows.push(buildPlanSheetRow_(
        formatCodeRun_(codeNumbers[index]),
        prepared.newRows[index],
        PLAN_CONFIG.REMARK_REGULAR
      ));
    }

    var firstOutputRow = Math.max(sheet.getLastRow() + 1, PLAN_CONFIG.FIRST_DATA_ROW);
    ensurePlanSheetRows_(sheet, firstOutputRow, outputRows.length);
    sheet.getRange(firstOutputRow, 1, outputRows.length, PLAN_CONFIG.PLAN_COLUMNS)
      .setValues(outputRows);
    SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();

    return {
      success: true,
      source: prepared.source,
      startDate: prepared.startDateText,
      endDate: prepared.endDateText,
      workingDateCount: prepared.planDates.length,
      totalCandidateRows: prepared.candidateRows.length,
      createdRowCount: outputRows.length,
      duplicateRowCount: prepared.duplicateRows.length,
      firstOutputRow: firstOutputRow,
      lastOutputRow: firstOutputRow + outputRows.length - 1,
      startCodeRun: outputRows[0][0],
      endCodeRun: outputRows[outputRows.length - 1][0],
      durationMs: Date.now() - startedAt,
      message: 'สร้าง Plan สำเร็จ'
    };
  } finally {
    lock.releaseLock();
  }
}

function getPlanTimeSortMinutes_(value) {
  var normalizedTime = normalizePlanTime_(value);
  if (!normalizedTime) return Number.MAX_SAFE_INTEGER;
  var parts = normalizedTime.split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function sortTemplateRowsByPlanTime_(rows) {
  return rows
    .map(function(row, originalIndex) {
      return { row: row, originalIndex: originalIndex };
    })
    .sort(function(first, second) {
      var firstEta = getPlanTimeSortMinutes_(first.row.planEta);
      var secondEta = getPlanTimeSortMinutes_(second.row.planEta);
      if (firstEta !== secondEta) return firstEta - secondEta;

      var firstEtd = getPlanTimeSortMinutes_(first.row.planEtd);
      var secondEtd = getPlanTimeSortMinutes_(second.row.planEtd);
      if (firstEtd !== secondEtd) return firstEtd - secondEtd;

      return first.originalIndex - second.originalIndex;
    })
    .map(function(item) {
      return item.row;
    });
}

function preparePlanPeriodData_(
  startDateText,
  endDateText,
  workingDays,
  source,
  templateRows
) {
  var normalizedSource = String(source || 'master-plan').trim().toLowerCase();
  if (normalizedSource !== 'master-plan' && normalizedSource !== 'uploaded-file') {
    throw new Error('source ต้องเป็น master-plan หรือ uploaded-file');
  }

  var template = normalizedSource === 'uploaded-file'
    ? normalizeUploadedTemplateRows_(templateRows)
    : getMasterPlanData();

  if (!template.success) {
    var firstError = template.validationErrors[0];
    throw new Error(
      'ข้อมูลต้นแบบไม่ถูกต้อง' +
      (firstError
        ? ' แถว ' + firstError.sheetRow + ': ' + firstError.errors.join(', ')
        : '')
    );
  }

  if (template.rows.length === 0) throw new Error('ข้อมูลต้นแบบไม่มีรายการ Plan');

  var sortedTemplateRows = sortTemplateRowsByPlanTime_(template.rows);

  var startDate = parsePlanInputDate_(startDateText);
  var endDate = parsePlanInputDate_(endDateText);
  if (!startDate) throw new Error('Start Date ไม่ถูกต้อง กรุณาใช้รูปแบบ yyyy-MM-dd');
  if (!endDate) throw new Error('End Date ไม่ถูกต้อง กรุณาใช้รูปแบบ yyyy-MM-dd');
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('End Date ต้องไม่น้อยกว่า Start Date');
  }

  var calendarDayCount = Math.floor(
    (endDate.getTime() - startDate.getTime()) / 86400000
  ) + 1;
  if (calendarDayCount > PLAN_CONFIG.MAX_PERIOD_DAYS) {
    throw new Error('ช่วงวันที่ต้องไม่เกิน ' + PLAN_CONFIG.MAX_PERIOD_DAYS + ' วัน');
  }

  var normalizedWorkingDays = normalizeWorkingDays_(workingDays);
  if (normalizedWorkingDays.length === 0) {
    throw new Error('กรุณาเลือกวันทำงานอย่างน้อย 1 วัน');
  }

  var planDates = generatePlanDates_(startDate, endDate, normalizedWorkingDays);
  if (planDates.length === 0) throw new Error('ไม่พบวันทำงานในช่วงวันที่ที่เลือก');

  var existingKeys = getExistingPlanDuplicateKeys_();
  var batchKeys = {};
  var candidateRows = [];
  var newRows = [];
  var duplicateRows = [];

  for (var dateIndex = 0; dateIndex < planDates.length; dateIndex += 1) {
    var dateText = formatPlanDate_(planDates[dateIndex]);

    for (var rowIndex = 0; rowIndex < sortedTemplateRows.length; rowIndex += 1) {
      var templateRow = sortedTemplateRows[rowIndex];
      var candidate = {
        date: dateText,
        route: templateRow.route,
        company: templateRow.company,
        truckName: templateRow.truckName,
        truckType: templateRow.truckType,
        driverName: templateRow.driverName,
        telDriver: templateRow.telDriver,
        project: templateRow.project,
        dropPoint: templateRow.dropPoint,
        planEta: templateRow.planEta,
        planEtd: templateRow.planEtd,
        groupCode: templateRow.groupCode
      };

      var key = createPlanDuplicateKey_(candidate);
      candidateRows.push(candidate);

      if (existingKeys[key] === true || batchKeys[key] === true) {
        duplicateRows.push(candidate);
      } else {
        batchKeys[key] = true;
        newRows.push(candidate);
      }
    }
  }

  return {
    source: normalizedSource,
    template: template,
    startDateText: formatPlanDate_(startDate),
    endDateText: formatPlanDate_(endDate),
    calendarDayCount: calendarDayCount,
    workingDays: normalizedWorkingDays,
    planDates: planDates,
    candidateRows: candidateRows,
    newRows: newRows,
    duplicateRows: duplicateRows
  };
}

/* =========================================================
 * DAILY PLAN MANAGEMENT
 * ======================================================= */

function getDailyPlans(dateText) {
  var targetDate = normalizeInputDateText_(dateText);
  var sheet = getPlanSheet_();
  var lastRow = sheet.getLastRow();

  if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) {
    return {
      success: true,
      date: targetDate,
      rowCount: 0,
      activeCount: 0,
      regularCount: 0,
      extraCount: 0,
      cancelCount: 0,
      rows: []
    };
  }

  var values = sheet.getRange(
    PLAN_CONFIG.FIRST_DATA_ROW,
    1,
    lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
    PLAN_CONFIG.PLAN_COLUMNS
  ).getDisplayValues();

  var rows = [];
  for (var index = 0; index < values.length; index += 1) {
    var plan = mapPlanSheetRow_(values[index], index + PLAN_CONFIG.FIRST_DATA_ROW);
    if (plan.date === targetDate) rows.push(plan);
  }

  rows.sort(function(first, second) {
    return String(first.planEta).localeCompare(String(second.planEta));
  });

  return {
    success: true,
    date: targetDate,
    rowCount: rows.length,
    activeCount: rows.filter(function(row) {
      return row.remark !== PLAN_CONFIG.REMARK_CANCEL;
    }).length,
    regularCount: rows.filter(function(row) {
      return row.remark === PLAN_CONFIG.REMARK_REGULAR;
    }).length,
    extraCount: rows.filter(function(row) {
      return row.remark === PLAN_CONFIG.REMARK_EXTRA;
    }).length,
    cancelCount: rows.filter(function(row) {
      return row.remark === PLAN_CONFIG.REMARK_CANCEL;
    }).length,
    rows: rows
  };
}

function createExtraPlan(planData) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  }

  try {
    var normalized = normalizeEditablePlanData_(planData);
    var validationErrors = validateEditablePlanData_(normalized);
    if (validationErrors.length > 0) throw new Error(validationErrors.join(', '));

    assertPlanNotDuplicate_(normalized, '');
    var nextCodeNumber = generateNextCodeNumbers_(getUsedCodeRunNumbers_(), 1)[0];
    var codeRun = formatCodeRun_(nextCodeNumber);
    var sheet = getPlanSheet_();
    var outputRow = Math.max(sheet.getLastRow() + 1, PLAN_CONFIG.FIRST_DATA_ROW);
    var values = buildPlanSheetRow_(codeRun, normalized, PLAN_CONFIG.REMARK_EXTRA);

    ensurePlanSheetRows_(sheet, outputRow, 1);
    sheet.getRange(outputRow, 1, 1, PLAN_CONFIG.PLAN_COLUMNS).setValues([values]);
    SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();

    return {
      success: true,
      message: 'เพิ่ม Extra Plan สำเร็จ',
      codeRun: codeRun,
      rowNumber: outputRow,
      plan: mapPlanSheetRow_(values, outputRow)
    };
  } finally {
    lock.releaseLock();
  }
}

function createDailyPlansBatch(plansData) {
  var lock=LockService.getDocumentLock();
  if(!lock.tryLock(30000))throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  var startedAt=Date.now();
  try {
    if(!Array.isArray(plansData)||!plansData.length)throw new Error('Daily Plan rows are required.');
    if(plansData.length>500)throw new Error('สร้างแผนประจำวันได้สูงสุด 500 รายการต่อครั้ง');
    var existingKeys=getExistingPlanDuplicateKeys_(),requestKeys={},prepared=[],duplicates=[],failed=[];
    for(var i=0;i<plansData.length;i+=1){try{var source=plansData[i]||{},plan=normalizeEditablePlanData_(source),errors=validateEditablePlanData_(plan,{allowEmptyCompany:true,allowEmptyTruckName:true});if(errors.length)throw new Error(errors.join(', '));var remark=normalizeRemark_(source.remark||PLAN_CONFIG.REMARK_REGULAR);if([PLAN_CONFIG.REMARK_REGULAR,PLAN_CONFIG.REMARK_EXTRA,PLAN_CONFIG.REMARK_CANCEL].indexOf(remark)<0)throw new Error('Remark ต้องเป็น REGULAR, EXTRA หรือ CANCEL');var key=createPlanDuplicateKey_(plan);if(existingKeys[key]===true||requestKeys[key]===true){duplicates.push({index:i});continue;}requestKeys[key]=true;prepared.push({plan:plan,remark:remark});}catch(error){failed.push({index:i,error:error&&error.message?error.message:String(error)});}}
    if(failed.length)return{success:false,message:'พบข้อมูลไม่ถูกต้อง กรุณาแก้ไขก่อนนำเข้า',requestedCount:plansData.length,createdCount:0,duplicateCount:duplicates.length,failedCount:failed.length,failedRows:failed,writeStrategy:'VALIDATION_STOP_BEFORE_WRITE',lockCount:1,durationMs:Date.now()-startedAt};
    if(!prepared.length)return{success:true,message:'ไม่มีรายการใหม่ ข้อมูลทั้งหมดซ้ำกับแผนเดิม',requestedCount:plansData.length,createdCount:0,duplicateCount:duplicates.length,failedCount:0,failedRows:[],startCodeRun:'-',endCodeRun:'-',writeStrategy:'NO_WRITE_ALL_DUPLICATE',lockCount:1,durationMs:Date.now()-startedAt};
    var numbers=generateNextCodeNumbers_(getUsedCodeRunNumbers_(),prepared.length),output=[];
    for(var j=0;j<prepared.length;j+=1)output.push(buildPlanSheetRow_(formatCodeRun_(numbers[j]),prepared[j].plan,prepared[j].remark));
    var sheet=getPlanSheet_(),first=Math.max(sheet.getLastRow()+1,PLAN_CONFIG.FIRST_DATA_ROW);ensurePlanSheetRows_(sheet,first,output.length);sheet.getRange(first,1,output.length,PLAN_CONFIG.PLAN_COLUMNS).setValues(output);SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();
    return{success:true,message:'เพิ่มแผนประจำวันสำเร็จ '+output.length+' รายการ',requestedCount:plansData.length,createdCount:output.length,duplicateCount:duplicates.length,failedCount:0,failedRows:[],firstOutputRow:first,lastOutputRow:first+output.length-1,startCodeRun:output[0][0],endCodeRun:output[output.length-1][0],writeStrategy:'SINGLE_SET_VALUES',lockCount:1,durationMs:Date.now()-startedAt};
  } finally {lock.releaseLock();}
}

function deleteExpiredDailyPlans(cutoffDateText, maximumRows) {
  var cutoffDate = normalizeInputDateText_(cutoffDateText);
  var limit = Math.max(1, Math.min(5000, Number(maximumRows || 5000)));
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(120000)) throw new Error('DOCUMENT_LOCK_BUSY_DELETE_EXPIRED_DAILY_PLANS');
  var startedAt = Date.now();
  try {
    var spreadsheet = getPlanSpreadsheet_();
    var planSheet = spreadsheet.getSheetByName(PLAN_CONFIG.PLAN_SHEET);
    var actualSheet = spreadsheet.getSheetByName(PLAN_CONFIG.ACTUAL_SHEET);
    if (!planSheet) throw new Error('ไม่พบชีต Plan');
    if (!actualSheet) throw new Error('ไม่พบชีต Actual data');
    var planRows = [], codeLookup = {}, deletedCodeRuns = [];
    var lastPlanRow = planSheet.getLastRow();
    if (lastPlanRow >= PLAN_CONFIG.FIRST_DATA_ROW) {
      var planValues = planSheet.getRange(PLAN_CONFIG.FIRST_DATA_ROW, 1, lastPlanRow - PLAN_CONFIG.FIRST_DATA_ROW + 1, Math.max(PLAN_CONFIG.PLAN_COLUMNS, planSheet.getLastColumn())).getValues();
      for (var index = 0; index < planValues.length; index += 1) {
        var codeRun = cleanPlanText_(planValues[index][0]).toUpperCase();
        var planDate = normalizeExistingPlanDate_(planValues[index][1]);
        if (!/^A\d+$/.test(codeRun) || !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) continue;
        if (planDate < cutoffDate) {
          planRows.push(index + PLAN_CONFIG.FIRST_DATA_ROW);
          if (!codeLookup[codeRun]) { codeLookup[codeRun] = true; deletedCodeRuns.push(codeRun); }
        }
      }
    }
    if (deletedCodeRuns.length > limit) throw new Error('RETENTION_DELETE_LIMIT_EXCEEDED:' + deletedCodeRuns.length + '>' + limit);
    var actualRows = [];
    if (deletedCodeRuns.length && actualSheet.getLastRow() >= PLAN_CONFIG.FIRST_DATA_ROW) {
      var actualCodes = actualSheet.getRange(PLAN_CONFIG.FIRST_DATA_ROW, 1, actualSheet.getLastRow() - PLAN_CONFIG.FIRST_DATA_ROW + 1, 1).getDisplayValues();
      for (var actualIndex = 0; actualIndex < actualCodes.length; actualIndex += 1) {
        if (codeLookup[cleanPlanText_(actualCodes[actualIndex][0]).toUpperCase()]) actualRows.push(actualIndex + PLAN_CONFIG.FIRST_DATA_ROW);
      }
    }
    var actualDeleteResult = deletePlanSheetRowsInRanges_(actualSheet, actualRows);
    var planDeleteResult = deletePlanSheetRowsInRanges_(planSheet, planRows);
    SpreadsheetApp.flush();
    if (planDeleteResult.deletedRowCount > 0) clearGpsPlanCacheAfterMutation_();
    return { success: true, cutoffDate: cutoffDate, requestedPlanCount: deletedCodeRuns.length, requestedActualCount: actualRows.length, planDeletedCount: planDeleteResult.deletedRowCount, actualDeletedCount: actualDeleteResult.deletedRowCount, failedCount: 0, deletedCodeRuns: deletedCodeRuns, planDeleteOperationCount: planDeleteResult.deleteOperationCount, actualDeleteOperationCount: actualDeleteResult.deleteOperationCount, deleteStrategy: 'ACTUAL_FIRST_CONTIGUOUS_ROW_RANGES', permanentDelete: true, lockCount: 1, durationMs: Date.now() - startedAt };
  } finally { lock.releaseLock(); }
}
function deletePlanSheetRowsInRanges_(sheet, rowNumbers) {
  if (!sheet || !Array.isArray(rowNumbers) || !rowNumbers.length) return { deletedRowCount: 0, deleteOperationCount: 0, ranges: [] };
  var seen = {};
  var rows = rowNumbers.map(Number).filter(function(rowNumber) { if (!Number.isInteger(rowNumber) || rowNumber < PLAN_CONFIG.FIRST_DATA_ROW || seen[rowNumber]) return false; seen[rowNumber] = true; return true; }).sort(function(first, second) { return second - first; });
  var ranges = [], highestRow = rows[0], lowestRow = rows[0];
  for (var index = 1; index < rows.length; index += 1) { var currentRow = rows[index]; if (currentRow === lowestRow - 1) { lowestRow = currentRow; continue; } ranges.push({ firstRow: lowestRow, rowCount: highestRow - lowestRow + 1 }); highestRow = currentRow; lowestRow = currentRow; }
  ranges.push({ firstRow: lowestRow, rowCount: highestRow - lowestRow + 1 });
  for (var rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) sheet.deleteRows(ranges[rangeIndex].firstRow, ranges[rangeIndex].rowCount);
  return { deletedRowCount: rows.length, deleteOperationCount: ranges.length, ranges: ranges };
}
function updatePlanByCodeRun(codeRun, planData) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  }

  try {
    var target = findPlanRowByCodeRun_(codeRun);
    if (!target) throw new Error('ไม่พบ Code run ' + codeRun);

    if (!planData || typeof planData !== 'object') {
      throw new Error('Plan data is required.');
    }
    var editableData = Object.assign({}, planData);
    var submittedGroupCode = normalizeGroupCodeForPlan_(editableData.groupCode);
    var currentGroupCode = normalizeGroupCodeForPlan_(target.groupCode);
    // Preserve the current Group Code when an unrelated edit arrives with a
    // missing or unexpectedly blank Group Code.
    editableData.groupCode = submittedGroupCode || currentGroupCode;

    var normalized = normalizeEditablePlanData_(editableData);
    var validationErrors = validateEditablePlanData_(normalized);
    if (validationErrors.length > 0) throw new Error(validationErrors.join(', '));

    assertPlanNotDuplicate_(normalized, target.codeRun);
    var remark = normalizeRemark_(
      planData && planData.remark !== undefined ? planData.remark : target.remark
    );
    normalized.workDetailConfirmed = target.workDetailConfirmed;
    var values = buildPlanSheetRow_(target.codeRun, normalized, remark);
    var sheet = getPlanSheet_();

    sheet.getRange(target.rowNumber, 1, 1, PLAN_CONFIG.PLAN_COLUMNS)
      .setValues([values]);
    SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();

    return {
      success: true,
      message: 'แก้ไข Plan สำเร็จ',
      codeRun: target.codeRun,
      rowNumber: target.rowNumber,
      plan: mapPlanSheetRow_(values, target.rowNumber)
    };
  } finally {
    lock.releaseLock();
  }
}

function confirmWorkDetailByCodeRun(codeRun) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  }
  try {
    var target = findPlanRowByCodeRun_(codeRun);
    if (!target) throw new Error('ไม่พบ Code run ' + codeRun);
    if (!target.workDetail) throw new Error('Plan นี้ไม่มีรายละเอียดงานให้ยืนยัน');
    if (target.workDetailConfirmed === 'CONFIRMED') {
      return {
        success: true,
        message: 'รายละเอียดงานได้รับการยืนยันแล้ว',
        codeRun: target.codeRun,
        workDetailConfirmed: 'CONFIRMED'
      };
    }
    getPlanSheet_().getRange(target.rowNumber, 15).setValue('CONFIRMED');
    SpreadsheetApp.flush();
    return {
      success: true,
      message: 'ยืนยันดำเนินการตามรายละเอียดงานแล้ว',
      codeRun: target.codeRun,
      workDetailConfirmed: 'CONFIRMED'
    };
  } finally {
    lock.releaseLock();
  }
}

function cancelPlanByCodeRun(codeRun) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  }

  try {
    var target = findPlanRowByCodeRun_(codeRun);
    if (!target) throw new Error('ไม่พบ Code run ' + codeRun);

    if (target.remark === PLAN_CONFIG.REMARK_CANCEL) {
      return {
        success: true,
        message: 'Plan นี้เป็น CANCEL อยู่แล้ว',
        codeRun: target.codeRun,
        remark: PLAN_CONFIG.REMARK_CANCEL
      };
    }

    getPlanSheet_().getRange(target.rowNumber, 13)
      .setValue(PLAN_CONFIG.REMARK_CANCEL);
    SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();

    return {
      success: true,
      message: 'ยกเลิก Plan สำเร็จ',
      codeRun: target.codeRun,
      remark: PLAN_CONFIG.REMARK_CANCEL
    };
  } finally {
    lock.releaseLock();
  }
}

function restorePlanByCodeRun(codeRun, restoreAs) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    throw new Error('มีผู้ใช้อื่นกำลังจัดการ Plan กรุณารอสักครู่แล้วลองใหม่');
  }

  try {
    var target = findPlanRowByCodeRun_(codeRun);
    if (!target) throw new Error('ไม่พบ Code run ' + codeRun);

    var remark = String(restoreAs || PLAN_CONFIG.REMARK_REGULAR)
      .trim()
      .toUpperCase();

    if (
      remark !== PLAN_CONFIG.REMARK_REGULAR &&
      remark !== PLAN_CONFIG.REMARK_EXTRA
    ) {
      throw new Error('restoreAs ต้องเป็น REGULAR หรือ EXTRA');
    }

    getPlanSheet_().getRange(target.rowNumber, 13).setValue(remark);
    SpreadsheetApp.flush();clearGpsPlanCacheAfterMutation_();

    return {
      success: true,
      message: 'คืนค่า Plan สำเร็จ',
      codeRun: target.codeRun,
      remark: remark
    };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
 * SHARED HELPERS
 * ======================================================= */

function getExistingPlanDuplicateKeys_() {
  var sheet = getPlanSheet_();
  var keys = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) return keys;

  var values = sheet.getRange(
    PLAN_CONFIG.FIRST_DATA_ROW,
    1,
    lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
    PLAN_CONFIG.PLAN_COLUMNS
  ).getDisplayValues();

  for (var index = 0; index < values.length; index += 1) {
    var plan = mapPlanSheetRow_(values[index], index + PLAN_CONFIG.FIRST_DATA_ROW);
    if (plan.remark === PLAN_CONFIG.REMARK_CANCEL) continue;
    keys[createPlanDuplicateKey_(plan)] = true;
  }

  return keys;
}

function assertPlanNotDuplicate_(planData, excludedCodeRun) {
  var sheet = getPlanSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) return;

  var targetKey = createPlanDuplicateKey_(planData);
  var values = sheet.getRange(
    PLAN_CONFIG.FIRST_DATA_ROW,
    1,
    lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
    PLAN_CONFIG.PLAN_COLUMNS
  ).getDisplayValues();

  for (var index = 0; index < values.length; index += 1) {
    var existing = mapPlanSheetRow_(values[index], index + PLAN_CONFIG.FIRST_DATA_ROW);
    if (
      existing.codeRun === excludedCodeRun ||
      existing.remark === PLAN_CONFIG.REMARK_CANCEL
    ) {
      continue;
    }

    if (createPlanDuplicateKey_(existing) === targetKey) {
      throw new Error('พบ Plan ซ้ำกับ Code run ' + existing.codeRun);
    }
  }
}

function getUsedCodeRunNumbers_() {
  var spreadsheet = getPlanSpreadsheet_();
  var usedNumbers = {};
  var sheetNames = [PLAN_CONFIG.PLAN_SHEET, PLAN_CONFIG.ACTUAL_SHEET];

  for (var sheetIndex = 0; sheetIndex < sheetNames.length; sheetIndex += 1) {
    var sheet = spreadsheet.getSheetByName(sheetNames[sheetIndex]);
    if (!sheet) throw new Error('ไม่พบชีต ' + sheetNames[sheetIndex]);

    var lastRow = sheet.getLastRow();
    if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) continue;

    var values = sheet.getRange(
      PLAN_CONFIG.FIRST_DATA_ROW,
      1,
      lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
      1
    ).getDisplayValues();

    for (var index = 0; index < values.length; index += 1) {
      var number = extractCodeRunNumber_(values[index][0]);
      if (number !== null) usedNumbers[number] = true;
    }
  }

  return usedNumbers;
}

function generateNextCodeNumbers_(usedNumbers, quantity) {
  var keys = Object.keys(usedNumbers);
  var maximumNumber = 0;

  for (var index = 0; index < keys.length; index += 1) {
    maximumNumber = Math.max(maximumNumber, Number(keys[index]));
  }

  var result = [];
  var candidate = maximumNumber + 1;

  while (result.length < quantity) {
    if (usedNumbers[candidate] !== true) {
      result.push(candidate);
      usedNumbers[candidate] = true;
    }
    candidate += 1;
  }

  return result;
}

function calculateCodeRunRange_(rowCount) {
  var usedNumbers = getUsedCodeRunNumbers_();
  var keys = Object.keys(usedNumbers);
  var maximumNumber = 0;

  for (var index = 0; index < keys.length; index += 1) {
    maximumNumber = Math.max(maximumNumber, Number(keys[index]));
  }

  if (rowCount <= 0) {
    return {
      currentMaximumCodeRun: maximumNumber > 0 ? formatCodeRun_(maximumNumber) : '-',
      startCodeRun: '-',
      endCodeRun: '-'
    };
  }

  var numbers = generateNextCodeNumbers_(usedNumbers, rowCount);
  return {
    currentMaximumCodeRun: maximumNumber > 0 ? formatCodeRun_(maximumNumber) : '-',
    startCodeRun: formatCodeRun_(numbers[0]),
    endCodeRun: formatCodeRun_(numbers[numbers.length - 1])
  };
}

function findPlanRowByCodeRun_(codeRun) {
  var normalizedCodeRun = cleanPlanText_(codeRun).toUpperCase();
  if (!normalizedCodeRun) throw new Error('codeRun is required.');

  var sheet = getPlanSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < PLAN_CONFIG.FIRST_DATA_ROW) return null;

  var values = sheet.getRange(
    PLAN_CONFIG.FIRST_DATA_ROW,
    1,
    lastRow - PLAN_CONFIG.FIRST_DATA_ROW + 1,
    PLAN_CONFIG.PLAN_COLUMNS
  ).getDisplayValues();

  for (var index = 0; index < values.length; index += 1) {
    var plan = mapPlanSheetRow_(values[index], index + PLAN_CONFIG.FIRST_DATA_ROW);
    if (plan.codeRun === normalizedCodeRun) return plan;
  }

  return null;
}

function normalizeEditablePlanData_(data) {
  if (!data || typeof data !== 'object') throw new Error('Plan data is required.');

  return {
    date: normalizeInputDateText_(data.date),
    route: cleanPlanText_(data.route),
    company: cleanPlanText_(data.company),
    truckName: cleanPlanText_(data.truckName),
    truckType: cleanPlanText_(data.truckType),
    driverName: cleanPlanText_(data.driverName),
    telDriver: cleanPlanText_(data.telDriver),
    project: cleanPlanText_(data.project),
    dropPoint: cleanPlanText_(data.dropPoint),
    planEta: normalizePlanTime_(data.planEta),
    planEtd: normalizePlanTime_(data.planEtd),
    workDetail: cleanPlanText_(data.workDetail),
    workDetailConfirmed: cleanPlanText_(data.workDetailConfirmed).toUpperCase(),
    groupCode: normalizeGroupCodeForPlan_(data.groupCode)
  };
}

function validateEditablePlanData_(row, options) {
  options = options || {};
  var errors = [];
  if (!row.date) errors.push('Date ไม่ถูกต้อง');
  if (!row.route) errors.push('Route ว่าง');
  if (!row.company) errors.push('Company ว่าง');
  if (!options.allowEmptyTruckName && !row.truckName) errors.push('Truck Name ว่าง');
  if (!row.truckType) errors.push('Truck Type ว่าง');
  if (!row.project) errors.push('Project ว่าง');
  if (!row.dropPoint) errors.push('Drop Point ว่าง');
  if (!row.planEta) errors.push('Plan ETA ว่างหรือรูปแบบไม่ถูกต้อง');
  if (!row.planEtd) errors.push('Plan ETD ว่างหรือรูปแบบไม่ถูกต้อง');
  return errors;
}

function buildPlanSheetRow_(codeRun, plan, remark) {
  return [
    codeRun,
    createPlanSheetDate_(plan.date),
    plan.route,
    plan.company,
    plan.truckName,
    plan.truckType,
    plan.driverName,
    plan.telDriver,
    plan.project,
    plan.dropPoint,
    plan.planEta,
    plan.planEtd,
    normalizeRemark_(remark),
    cleanPlanText_(plan.workDetail),
    cleanPlanText_(plan.workDetailConfirmed).toUpperCase() === 'CONFIRMED'
      ? 'CONFIRMED'
      : '',
    normalizeGroupCodeForPlan_(plan.groupCode)
  ];
}

function mapPlanSheetRow_(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    codeRun: cleanPlanText_(row[0]).toUpperCase(),
    date: normalizeExistingPlanDate_(row[1]),
    route: cleanPlanText_(row[2]),
    company: cleanPlanText_(row[3]),
    truckName: cleanPlanText_(row[4]),
    truckType: cleanPlanText_(row[5]),
    driverName: cleanPlanText_(row[6]),
    telDriver: cleanPlanText_(row[7]),
    project: cleanPlanText_(row[8]),
    dropPoint: cleanPlanText_(row[9]),
    planEta: normalizePlanTime_(row[10]),
    planEtd: normalizePlanTime_(row[11]),
    remark: normalizeRemark_(row[12]),
    workDetail: cleanPlanText_(row[13]),
    workDetailConfirmed: cleanPlanText_(row[14]).toUpperCase(),
    groupCode: normalizeGroupCodeForPlan_(row[15])
  };
}

function normalizeGroupCodeForPlan_(value) {
  return cleanPlanText_(value).toUpperCase().replace(/\s+/g, '');
}
function normalizeRemark_(value) {
  var remark = cleanPlanText_(value).toUpperCase();
  return remark || PLAN_CONFIG.REMARK_REGULAR;
}

function normalizeTemplateRow_(row, displayRow) {
  var values = Array.isArray(row) ? row : [];
  return {
    sheetRow: displayRow,
    route: cleanPlanText_(values[0]),
    company: cleanPlanText_(values[1]),
    truckName: cleanPlanText_(values[2]),
    truckType: cleanPlanText_(values[3]),
    driverName: cleanPlanText_(values[4]),
    telDriver: cleanPlanText_(values[5]),
    project: cleanPlanText_(values[6]),
    dropPoint: cleanPlanText_(values[7]),
    planEta: normalizePlanTime_(values[8]),
    planEtd: normalizePlanTime_(values[9]),
    groupCode: normalizeGroupCodeForPlan_(values[10])
  };
}

function validateTemplateRow_(row) {
  var errors = [];
  if (!row.route) errors.push('Route ว่าง');
  if (!row.company) errors.push('Company ว่าง');
  if (!row.truckType) errors.push('Truck Type ว่าง');
  if (!row.project) errors.push('Project ว่าง');
  if (!row.dropPoint) errors.push('Drop Point ว่าง');
  if (!row.planEta) errors.push('Plan ETA ว่างหรือรูปแบบไม่ถูกต้อง');
  if (!row.planEtd) errors.push('Plan ETD ว่างหรือรูปแบบไม่ถูกต้อง');
  return errors;
}

function isTemplateRowEmpty_(row) {
  return (
    !row.route &&
    !row.company &&
    !row.truckName &&
    !row.truckType &&
    !row.driverName &&
    !row.telDriver &&
    !row.project &&
    !row.dropPoint &&
    !row.planEta &&
    !row.planEtd &&
    !row.groupCode
  );
}

function createPlanDuplicateKey_(plan) {
  return [
    normalizePlanKeyText_(plan.date),
    normalizePlanKeyText_(plan.route),
    normalizeLicensePlateForPlan_(plan.truckName),
    normalizePlanKeyText_(plan.dropPoint),
    normalizePlanTime_(plan.planEta),
    normalizePlanTime_(plan.planEtd)
  ].join('|');
}

function normalizePlanKeyText_(value) {
  return cleanPlanText_(value).toUpperCase().replace(/\s+/g, '');
}

function normalizeLicensePlateForPlan_(value) {
  return cleanPlanText_(value)
    .split('(')[0]
    .toUpperCase()
    .replace(/[\s-]/g, '');
}

function cleanPlanText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizePlanTime_(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    var rawMinutes = Math.round(value * 1440);
    var totalMinutes = ((rawMinutes % 1440) + 1440) % 1440;
    return (
      String(Math.floor(totalMinutes / 60)).padStart(2, '0') +
      ':' +
      String(totalMinutes % 60).padStart(2, '0')
    );
  }

  var match = cleanPlanText_(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';

  var hour = Number(match[1]);
  var minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '';

  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

function parsePlanInputDate_(value) {
  var match = cleanPlanText_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  var date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeInputDateText_(value) {
  var date = parsePlanInputDate_(value);
  if (!date) throw new Error('วันที่ไม่ถูกต้อง กรุณาใช้รูปแบบ yyyy-MM-dd');
  return formatPlanDate_(date);
}

function normalizeExistingPlanDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return formatPlanDate_(value);
  }

  var text = cleanPlanText_(value);
  var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  var slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!slash) return text;

  var year = Number(slash[3]);
  if (year < 100) year += 2000;

  return (
    String(year) +
    '-' +
    String(Number(slash[2])).padStart(2, '0') +
    '-' +
    String(Number(slash[1])).padStart(2, '0')
  );
}

function formatPlanDate_(date) {
  return Utilities.formatDate(date, PLAN_CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function createPlanSheetDate_(dateText) {
  var date = parsePlanInputDate_(dateText);
  if (!date) throw new Error('วันที่ Plan ไม่ถูกต้อง: ' + dateText);
  return date;
}

function getPlanDayNumber_(date) {
  return date.getDay() === 0 ? 7 : date.getDay();
}

function normalizeWorkingDays_(workingDays) {
  var input = Array.isArray(workingDays) ? workingDays : PLAN_CONFIG.WORKING_DAYS;
  var lookup = {};
  var result = [];

  for (var index = 0; index < input.length; index += 1) {
    var day = Number(input[index]);
    if (Number.isInteger(day) && day >= 1 && day <= 7) lookup[day] = true;
  }

  Object.keys(lookup).forEach(function(key) {
    result.push(Number(key));
  });

  return result.sort(function(first, second) {
    return first - second;
  });
}

function generatePlanDates_(startDate, endDate, workingDays) {
  var lookup = {};
  var result = [];

  workingDays.forEach(function(day) {
    lookup[day] = true;
  });

  var currentDate = new Date(startDate.getTime());
  while (currentDate.getTime() <= endDate.getTime()) {
    if (lookup[getPlanDayNumber_(currentDate)] === true) {
      result.push(new Date(currentDate.getTime()));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return result;
}

function getWorkingDayLabels_(workingDays) {
  var labels = {
    1: 'จันทร์',
    2: 'อังคาร',
    3: 'พุธ',
    4: 'พฤหัสบดี',
    5: 'ศุกร์',
    6: 'เสาร์',
    7: 'อาทิตย์'
  };

  return workingDays.map(function(day) {
    return labels[day] || String(day);
  });
}

function extractCodeRunNumber_(codeRun) {
  var match = cleanPlanText_(codeRun)
    .toUpperCase()
    .match(new RegExp('^' + PLAN_CONFIG.CODE_PREFIX + '(\\d+)$'));

  if (!match) return null;
  var number = Number(match[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function formatCodeRun_(number) {
  return (
    PLAN_CONFIG.CODE_PREFIX +
    String(number).padStart(PLAN_CONFIG.CODE_DIGITS, '0')
  );
}

function ensurePlanSheetRows_(sheet, firstRow, rowCount) {
  var requiredLastRow = firstRow + rowCount - 1;
  var currentMaxRows = sheet.getMaxRows();

  if (requiredLastRow > currentMaxRows) {
    sheet.insertRowsAfter(currentMaxRows, requiredLastRow - currentMaxRows);
  }
}

function applyPlanOutputFormat_(sheet, firstRow, rowCount) {
  if (!sheet || rowCount <= 0) return;
}

function getPlanSheet_() {
  var sheet = getPlanSpreadsheet_().getSheetByName(PLAN_CONFIG.PLAN_SHEET);
  if (!sheet) throw new Error('ไม่พบชีต Plan');
  if (sheet.getLastColumn() < PLAN_CONFIG.PLAN_COLUMNS) {
    throw new Error('ชีต Plan ต้องมีอย่างน้อย 16 คอลัมน์ A ถึง P และคอลัมน์ P ชื่อ Group Code');
  }
  return sheet;
}

function getPlanSpreadsheet_() {
  if (typeof openEliveSpreadsheet_ === 'function') {
    return openEliveSpreadsheet_();
  }

  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('ไม่สามารถเปิด Google Sheets ได้');
  return spreadsheet;
}

/* =========================================================
 * SAFE TEST FUNCTIONS
 * ======================================================= */

function testPlanManagementFunctions() {
  var result = {
    success: true,
    functions: {
      getMasterPlanData: typeof getMasterPlanData === 'function',
      previewPlanPeriod: typeof previewPlanPeriod === 'function',
      createPlanPeriod: typeof createPlanPeriod === 'function',
      getDailyPlans: typeof getDailyPlans === 'function',
      createExtraPlan: typeof createExtraPlan === 'function',
      createDailyPlansBatch: typeof createDailyPlansBatch === 'function',
      deleteExpiredDailyPlans: typeof deleteExpiredDailyPlans === 'function',
      updatePlanByCodeRun: typeof updatePlanByCodeRun === 'function',
      cancelPlanByCodeRun: typeof cancelPlanByCodeRun === 'function',
      restorePlanByCodeRun: typeof restorePlanByCodeRun === 'function',
      confirmWorkDetailByCodeRun: typeof confirmWorkDetailByCodeRun === 'function'
    },
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function testGetDailyPlans() {
  var result = getDailyPlans(
    Utilities.formatDate(new Date(), PLAN_CONFIG.TIMEZONE, 'yyyy-MM-dd')
  );

  console.log(JSON.stringify(result, null, 2));
  return result;
}
