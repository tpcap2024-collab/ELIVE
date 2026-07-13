/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TruckData } from '../types';

export const INITIAL_TRUCKS: TruckData[] = [
  {
    id: 'TRK-001',
    plateNo: '70-4581 ชลบุรี',
    route: 'TPCAP - แหลมฉบัง (Chonburi)',
    logisticsCo: 'TPCAP Logistics',
    driverName: 'นายสมชาย ดีใจ',
    driverPhone: '081-234-5678',
    etaTpcap: '14:30',
    etdTpcap: '08:00',
    currentLocation: 'ถนนสุขุมวิท กม. 120 (ศรีราชา)',
    speed: 68,
    distanceToTpcap: 35.4,
    status: 'Traveling',
    lastGpsUpdate: '10 วินาทีที่แล้ว',
    coordinateX: 42,
    coordinateY: 65,
    currentRouteIndex: 3,
    routePoints: [
      { x: 15, y: 35 }, // TPCAP
      { x: 25, y: 45 }, 
      { x: 35, y: 55 },
      { x: 42, y: 65 }, // Current
      { x: 50, y: 72 },
      { x: 60, y: 80 }  // Laem Chabang
    ],
    timeline: [
      { id: 't1', time: '08:00', title: 'เดินทางออกจาก TPCAP', description: 'เริ่มงาน, ตรวจสอบสภาพรถเรียบร้อย', status: 'completed' },
      { id: 't2', time: '09:30', title: 'จุดพักรถ มอเตอร์เวย์ กม. 50', description: 'แวะพัก 15 นาทีตามกฎความปลอดภัย', status: 'completed' },
      { id: 't3', time: '11:15', title: 'ผ่านด่านเก็บเงินพานทอง', description: 'ความเร็วปกติ 70 km/h', status: 'current' },
      { id: 't4', time: '14:30', title: 'ถึงท่าเรือแหลมฉบัง (ETA)', description: 'กำหนดการเข้าตู้สินค้าโซน C', status: 'pending' }
    ]
  },
  {
    id: 'TRK-002',
    plateNo: '71-9014 กรุงเทพฯ',
    route: 'TPCAP - อมตะซิตี้ (Chonburi)',
    logisticsCo: 'Siam Express',
    driverName: 'นายวิชัย รักสงบ',
    driverPhone: '089-876-5432',
    etaTpcap: '09:15',
    etdTpcap: '06:30',
    currentLocation: 'ลานจอดรถในโรงงาน TPCAP',
    speed: 0,
    distanceToTpcap: 0,
    status: 'At_Area',
    lastGpsUpdate: '1 นาทีที่แล้ว',
    coordinateX: 15,
    coordinateY: 35,
    currentRouteIndex: 0,
    routePoints: [
      { x: 15, y: 35 }, // Current at TPCAP
      { x: 28, y: 38 },
      { x: 38, y: 42 },
      { x: 48, y: 46 }  // Amata
    ],
    timeline: [
      { id: 't1', time: '06:30', title: 'ลงทะเบียนเข้าคลัง TPCAP', description: 'รอดำเนินการขึ้นตู้คอนเทนเนอร์', status: 'completed' },
      { id: 't2', time: '07:15', title: 'จุดขึ้นสินค้าคลัง A', description: 'กำลังโหลดชิ้นส่วนอะไหล่รถยนต์', status: 'completed' },
      { id: 't3', time: '08:45', title: 'ตรวจชั่งน้ำหนักรถบรรทุก', description: 'น้ำหนักสุทธิ 28.5 ตัน ผ่านเกณฑ์', status: 'current' },
      { id: 't4', time: '09:15', title: 'อยู่ในพื้นที่เตรียมออกเดินทาง', description: 'คนขับอยู่ประจำรถ รอกระดาษใบนำส่ง', status: 'current' }
    ]
  },
  {
    id: 'TRK-003',
    plateNo: '72-2241 ระยอง',
    route: 'TPCAP - มาบตาพุด (Rayong)',
    logisticsCo: 'P.K. Transport',
    driverName: 'นายมานพ แก้วดี',
    driverPhone: '082-345-6789',
    etaTpcap: '16:00',
    etdTpcap: '09:00',
    currentLocation: 'นิคมอุตสาหกรรมมาบตาพุด โซน I-4',
    speed: 0,
    distanceToTpcap: 112.0,
    status: 'Delivered',
    lastGpsUpdate: '30 วินาทีที่แล้ว',
    coordinateX: 85,
    coordinateY: 82,
    currentRouteIndex: 4,
    routePoints: [
      { x: 15, y: 35 }, // TPCAP
      { x: 30, y: 50 },
      { x: 48, y: 62 },
      { x: 68, y: 73 },
      { x: 85, y: 82 }  // Delivered
    ],
    timeline: [
      { id: 't1', time: '09:00', title: 'ออกจากคลัง TPCAP', description: 'ตู้สินค้าประเภทเคมีภัณฑ์ปิดผนึก', status: 'completed' },
      { id: 't2', time: '11:45', title: 'ผ่านจุดตรวจความปลอดภัยเขาไม้แก้ว', description: 'ตรวจระบบเบรกและลมยางปกติ', status: 'completed' },
      { id: 't3', time: '13:00', title: 'เข้าเขตนิคมฯ มาบตาพุด', description: 'จอดลงทะเบียนเอกสารความปลอดภัยหน้าคลัง', status: 'completed' },
      { id: 't4', time: '14:15', title: 'ส่งมอบงานเสร็จสิ้น', description: 'ลูกค้าลงนามรับมอบสินค้าในระบบอิเล็กทรอนิกส์ (e-POD)', status: 'completed' }
    ]
  },
  {
    id: 'TRK-004',
    plateNo: '70-9875 อยุธยา',
    route: 'โรจนะ (Ayutthaya) - TPCAP',
    logisticsCo: 'V-Cargo',
    driverName: 'นายสุรศักดิ์ ใจกว้าง',
    driverPhone: '085-456-7890',
    etaTpcap: '11:45',
    etdTpcap: '07:15',
    currentLocation: 'ถนนพหลโยธิน กม. 54 (วังน้อย)',
    speed: 72,
    distanceToTpcap: 62.1,
    status: 'Traveling',
    lastGpsUpdate: '12 วินาทีที่แล้ว',
    coordinateX: 30,
    coordinateY: 18,
    currentRouteIndex: 2,
    routePoints: [
      { x: 45, y: 5 },  // Ayutthaya
      { x: 38, y: 12 },
      { x: 30, y: 18 }, // Current
      { x: 22, y: 24 },
      { x: 15, y: 35 }  // TPCAP
    ],
    timeline: [
      { id: 't1', time: '07:15', title: 'โหลดสินค้าต้นทางโรงงานโรจนะ', description: 'ม้วนเหล็กสปริงรวม 3 ม้วน', status: 'completed' },
      { id: 't2', time: '08:45', title: 'เริ่มออกเดินทางขาล่อง', description: 'มุ่งหน้าถนนวงแหวนตะวันออก (9)', status: 'completed' },
      { id: 't3', time: '10:15', title: 'ผ่านด่านเก็บเงินธัญบุรี 1', description: 'การจราจรหนาแน่นปานกลาง ความเร็วเฉลี่ย 70 km/h', status: 'current' },
      { id: 't4', time: '11:45', title: 'กำหนดถึงปลายทาง TPCAP (ETA)', description: 'เตรียมจอดในช่องจอดรับสินค้าด่วน คลัง 3', status: 'pending' }
    ]
  },
  {
    id: 'TRK-005',
    plateNo: '10-3342 สมุทรปราการ',
    route: 'TPCAP - บางนา (Bangna)',
    logisticsCo: 'TPCAP Logistics',
    driverName: 'นายอภิชาติ นามมั่น',
    driverPhone: '083-789-0123',
    etaTpcap: '08:30',
    etdTpcap: '05:00',
    currentLocation: 'ขาดการเชื่อมต่อสัญญาณ GPS นานเกิน 1 ชม.',
    speed: 0,
    distanceToTpcap: 18.2,
    status: 'Offline',
    lastGpsUpdate: '1 ชั่วโมงที่แล้ว',
    coordinateX: 20,
    coordinateY: 30,
    currentRouteIndex: 1,
    routePoints: [
      { x: 15, y: 35 }, // TPCAP
      { x: 20, y: 30 }, // Current (lost here)
      { x: 25, y: 25 }  // Bangna
    ],
    timeline: [
      { id: 't1', time: '05:00', title: 'ออกจากท่ารถ TPCAP', description: 'สินค้าเร่งด่วนสำหรับจัดงานแสดง', status: 'completed' },
      { id: 't2', time: '05:30', title: 'พิกัดกิ่งแก้ว ซอย 19', description: 'พบสัญญาณ GPS ผิดปกติ อัปเดตล่าช้า', status: 'completed' },
      { id: 't3', time: '06:00', title: 'ขาดการส่งสัญญาณพิกัด', description: 'เจ้าหน้าที่กำลังติดต่อผ่านวิทยุสื่อสารและมือถือสำรอง', status: 'current' }
    ]
  },
  {
    id: 'TRK-006',
    plateNo: '73-2284 ระยอง',
    route: 'TPCAP - มาบตาพุด (Rayong)',
    logisticsCo: 'Inter-Siam Logistics',
    driverName: 'นายเกรียงไกร มีสุข',
    driverPhone: '084-567-1234',
    etaTpcap: '17:45',
    etdTpcap: '11:30',
    currentLocation: 'ทางหลวงหมายเลข 36 เลี่ยงเมืองชลบุรี',
    speed: 78,
    distanceToTpcap: 72.8,
    status: 'Traveling',
    lastGpsUpdate: '5 วินาทีที่แล้ว',
    coordinateX: 55,
    coordinateY: 70,
    currentRouteIndex: 2,
    routePoints: [
      { x: 15, y: 35 },
      { x: 35, y: 55 },
      { x: 55, y: 70 }, // Current
      { x: 70, y: 76 },
      { x: 85, y: 82 }
    ],
    timeline: [
      { id: 't1', time: '11:30', title: 'ออกจาก TPCAP', description: 'เริ่มงานขนส่งเคมีภัณฑ์ล็อตสุดท้าย', status: 'completed' },
      { id: 't2', time: '12:15', title: 'ผ่านจุดเชื่อมด่านบางโปรง', description: 'ความเร็วสม่ำเสมอ รถโล่ง', status: 'completed' },
      { id: 't3', time: '13:00', title: 'พิกัดชลบุรีเลี่ยงเมือง', description: 'เดินทางต่อเนี่องทิศทางระยอง', status: 'current' }
    ]
  },
  {
    id: 'TRK-007',
    plateNo: '10-4412 ปทุมธานี',
    route: 'นวนคร (Pathum Thani) - TPCAP',
    logisticsCo: 'P.K. Transport',
    driverName: 'นายธนพล รุ่งเรือง',
    driverPhone: '086-123-4567',
    etaTpcap: '15:10',
    etdTpcap: '12:00',
    currentLocation: 'คลังสินค้าปลายทาง TPCAP ฝั่งรับวัตถุดิบ',
    speed: 5,
    distanceToTpcap: 0.2,
    status: 'At_Area',
    lastGpsUpdate: '20 วินาทีที่แล้ว',
    coordinateX: 16,
    coordinateY: 34,
    currentRouteIndex: 3,
    routePoints: [
      { x: 28, y: 15 }, // Navanakorn
      { x: 22, y: 22 },
      { x: 18, y: 29 },
      { x: 16, y: 34 }  // Near TPCAP
    ],
    timeline: [
      { id: 't1', time: '12:00', title: 'รับกล่องพัสดุจากคลังนวนคร', description: 'บรรจุภัณฑ์อิเล็กทรอนิกส์ความมั่นคงสูง', status: 'completed' },
      { id: 't2', time: '13:15', title: 'ผ่านจุดตรวจทางด่วนอุดรรัถยา', description: 'สภาพอากาศมีฝนตกปรอยๆ ความเร็วลดเหลือ 60 km/h', status: 'completed' },
      { id: 't3', time: '14:45', title: 'เข้าเขตเมืองสมุทรปราการ', description: 'ใกล้ถึงโรงงาน TPCAP', status: 'completed' },
      { id: 't4', time: '15:05', title: 'อยู่หน้าประตูทางเข้า TPCAP', description: 'รอดำเนินการแลกบัตรและตรวจอุณหภูมิคนขับ', status: 'current' }
    ]
  },
  {
    id: 'TRK-008',
    plateNo: '70-1123 สระบุรี',
    route: 'TPCAP - สระบุรี (Saraburi)',
    logisticsCo: 'V-Cargo',
    driverName: 'นายณรงค์ฤทธิ์ แซ่ตั้ง',
    driverPhone: '087-987-6543',
    etaTpcap: '19:00',
    etdTpcap: '14:00',
    currentLocation: 'ยังไม่เริ่มเดินทาง ออกรอบเวลากลางคืน',
    speed: 0,
    distanceToTpcap: 0,
    status: 'Offline',
    lastGpsUpdate: 'ยังไม่เริ่มจับพิกัด',
    coordinateX: 15,
    coordinateY: 35, // Remains at TPCAP
    currentRouteIndex: 0,
    routePoints: [
      { x: 15, y: 35 }, // TPCAP
      { x: 25, y: 20 },
      { x: 35, y: 10 },
      { x: 45, y: 2 }   // Saraburi
    ],
    timeline: [
      { id: 't1', time: '14:00', title: 'รับใบสั่งขนส่งสารเคมีสระบุรี', description: 'เตรียมตรวจสอบความปลอดภัยประจำวัน', status: 'completed' },
      { id: 't2', time: '17:00', title: 'กำหนดตรวจรอบรถ', description: 'ช่างเครื่องตรวจสอบลมเบรกคู่ท้ายถังลาก', status: 'pending' }
    ]
  },
  {
    id: 'TRK-009',
    plateNo: '10-7762 นนทบุรี',
    route: 'บางนา (Bangna) - TPCAP',
    logisticsCo: 'Siam Express',
    driverName: 'นายปัญญา ทรัพย์มาก',
    driverPhone: '089-345-1234',
    etaTpcap: '14:00',
    etdTpcap: '10:00',
    currentLocation: 'จุดจอดปลายทาง คลังจัดส่ง TPCAP Zone C',
    speed: 0,
    distanceToTpcap: 0,
    status: 'Delivered',
    lastGpsUpdate: '2 นาทีที่แล้ว',
    coordinateX: 15,
    coordinateY: 35,
    currentRouteIndex: 2,
    routePoints: [
      { x: 25, y: 25 }, // Bangna
      { x: 20, y: 30 },
      { x: 15, y: 35 }  // TPCAP (Delivered)
    ],
    timeline: [
      { id: 't1', time: '10:00', title: 'โหลดชิ้นงานอลูมิเนียมจากคลังบางนา', description: 'รวมน้ำหนัก 15 ตัน พร้อมออกตัว', status: 'completed' },
      { id: 't2', time: '11:15', title: 'ผ่านแยกบางพลีใหญ่', description: 'จราจรหนาแน่นปกติ ทำความเร็ว 50 km/h', status: 'completed' },
      { id: 't3', time: '12:45', title: 'ผ่านจุดตรวจน้ำหนักบางวัว', description: 'น้ำหนักถูกต้องตามกฎหมาย', status: 'completed' },
      { id: 't4', time: '13:30', title: 'ส่งงานและขนถ่ายเสร็จสิ้น', description: 'บันทึกเซ็นต์รับของในระบบเรียบร้อย รถพร้อมจอดเข้าศูนย์', status: 'completed' }
    ]
  },
  {
    id: 'TRK-010',
    plateNo: '72-3392 ระยอง',
    route: 'TPCAP - แหลมฉบัง (Chonburi)',
    logisticsCo: 'TPCAP Logistics',
    driverName: 'นายสมศักดิ์ รักชาติ',
    driverPhone: '080-678-9012',
    etaTpcap: '16:15',
    etdTpcap: '13:00',
    currentLocation: 'ทางพิเศษบูรพาวิถี กม. 32 (บางพลีน้อย)',
    speed: 85,
    distanceToTpcap: 22.4,
    status: 'Traveling',
    lastGpsUpdate: '3 วินาทีที่แล้ว',
    coordinateX: 35,
    coordinateY: 55,
    currentRouteIndex: 2,
    routePoints: [
      { x: 15, y: 35 }, // TPCAP
      { x: 25, y: 45 },
      { x: 35, y: 55 }, // Current
      { x: 42, y: 65 },
      { x: 50, y: 72 },
      { x: 60, y: 80 }  // Laem Chabang
    ],
    timeline: [
      { id: 't1', time: '13:00', title: 'ออกตัวรับวัสดุก่อสร้างจาก TPCAP', description: 'จัดส่งแหลมฉบังเพื่อประกอบโครงสร้างใหญ่', status: 'completed' },
      { id: 't2', time: '13:30', title: 'ขึ้นด่านยกระดับบางพลี มุ่งหน้าชลบุรี', description: 'ใช้ความเร็วเดินทาง 85 km/h สัญญาณนิ่ง', status: 'current' }
    ]
  }
];

export const GOOGLE_SHEET_TEMPLATE_ID = '1-Xyz123_your_google_sheet_id_here';

export const SAMPLE_SHEETS_HELP = `
ระบบรองรับโครงสร้างสเปรดชีต 3 ชีทสมบูรณ์แบบ:

1. ชีท "Plan" (สำหรับอัปโหลดแผนวิ่งรายวัน):
- คอลัมน์ที่ต้องการ: Route, Plan ETA, Plan ETD, Truck type, Truck Name (เลขทะเบียนรถ), Driver Day, Driver Night, company

2. ชีท "API GPS" (สำหรับรับข้อมูลพิกัด GPS อัปเดต):
- คอลัมน์ที่ต้องการ: ทะเบียนรถ, สถานะ, ชื่อสถานี, เวลากล่อง, ความเร็ว, ละติจูด, ลองจิจูด

3. ชีท "แดชบอร์ด" (Dashboard):
- แสดงผลในแอปพลิเคชันโดยระบบจะผสานข้อมูล ทะเบียนรถ (Truck Name) จาก Plan และ API GPS เข้าด้วยกันแบบเรียลไทม์โดยอัตโนมัติ!
`;

export const GOOGLE_APPS_SCRIPT_CODE = `
// ตัวอย่าง Google Apps Script สำหรับใส่ใน Extensions > Apps Script ใน Google Sheet ของคุณ
// เพื่อสร้าง Web App API รองรับการส่งข้อมูล GPS และการดึงข้อมูลโดย ELIVE Dashboard

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = [];
  var rows = sheet.getDataRange().getValues();
  
  // ข้ามหัวตาราง (แถวที่ 1)
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    data.push({
      plateNo: row[0],
      route: row[1],
      logisticsCo: row[2],
      driverName: row[3],
      driverPhone: row[4],
      speed: parseFloat(row[5] || 0),
      distanceToTpcap: parseFloat(row[6] || 0),
      currentLocation: row[7],
      status: row[8],
      etaTpcap: row[9],
      etdTpcap: row[10],
      lastGpsUpdate: row[11]
    });
  }
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // ค้นหาแถวที่มีเลขทะเบียนรถเดียวกันเพื่อทำการ Update หรือแทรกแถวใหม่
    var rows = sheet.getDataRange().getValues();
    var foundIndex = -1;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i][0] === params.plateNo) {
        foundIndex = i + 1; // อิงเลขแถวจริง (1-indexed)
        break;
      }
    }
    
    var timestamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "HH:mm:ss dd/MM/yyyy");
    
    if (foundIndex !== -1) {
      // Update แถวเดิม
      sheet.getRange(foundIndex, 2).setValue(params.route);
      sheet.getRange(foundIndex, 3).setValue(params.logisticsCo);
      sheet.getRange(foundIndex, 4).setValue(params.driverName);
      sheet.getRange(foundIndex, 5).setValue(params.driverPhone);
      sheet.getRange(foundIndex, 6).setValue(params.speed);
      sheet.getRange(foundIndex, 7).setValue(params.distanceToTpcap);
      sheet.getRange(foundIndex, 8).setValue(params.currentLocation);
      sheet.getRange(foundIndex, 9).setValue(params.status);
      sheet.getRange(foundIndex, 10).setValue(params.etaTpcap);
      sheet.getRange(foundIndex, 11).setValue(params.etdTpcap);
      sheet.getRange(foundIndex, 12).setValue(timestamp);
    } else {
      // แทรกแถวใหม่ต่อท้ายสุด
      sheet.appendRow([
        params.plateNo,
        params.route,
        params.logisticsCo,
        params.driverName,
        params.driverPhone,
        params.speed,
        params.distanceToTpcap,
        params.currentLocation,
        params.status,
        params.etaTpcap,
        params.etdTpcap,
        timestamp
      ]);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "GPS data registered!" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;
