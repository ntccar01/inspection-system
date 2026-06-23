const STORAGE_KEY = "inspection-yard-mvp-state-v1";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const defaultState = {
  selectedDate: todayISO(),
  slots: [
    { time: "09:00-10:00", onlineCapacity: 6, walkInReserve: 2 },
    { time: "10:00-11:00", onlineCapacity: 6, walkInReserve: 2 },
    { time: "11:00-12:00", onlineCapacity: 5, walkInReserve: 2 },
    { time: "13:30-14:30", onlineCapacity: 6, walkInReserve: 3 },
    { time: "14:30-15:30", onlineCapacity: 6, walkInReserve: 3 },
    { time: "15:30-16:30", onlineCapacity: 5, walkInReserve: 2 }
  ],
  bookings: [
    {
      id: "B20260623001",
      plate: "ABC-1234",
      owner: "王先生",
      phone: "0912-345-678",
      type: "自用小客車",
      manufactured: "2014-05",
      bookingDate: todayISO(),
      slot: "09:00-10:00",
      status: "已報到",
      consent: true,
      noticeStatus: "尚未通知",
      followupStatus: "待處理",
      reminderNote: "",
      note: "電話預約補登"
    },
    {
      id: "B20260623002",
      plate: "KLD-8899",
      owner: "林小姐",
      phone: "0988-222-123",
      type: "自用小客車",
      manufactured: "2019-11",
      bookingDate: todayISO(),
      slot: "10:00-11:00",
      status: "等待檢驗",
      consent: true,
      noticeStatus: "尚未通知",
      followupStatus: "待處理",
      reminderNote: "",
      note: ""
    },
    {
      id: "B20260623003",
      plate: "TX-5678",
      owner: "陳先生",
      phone: "0975-111-888",
      type: "自用小貨車",
      manufactured: "2012-03",
      bookingDate: todayISO(),
      slot: "10:00-11:00",
      status: "檢驗中",
      consent: true,
      noticeStatus: "已通知",
      followupStatus: "需再追蹤",
      reminderNote: "已電話通知，車主表示月底前安排",
      note: "十年以上車輛"
    },
    {
      id: "B20260623004",
      plate: "NQH-2301",
      owner: "黃小姐",
      phone: "0933-876-655",
      type: "自用小客車",
      manufactured: "2020-08",
      bookingDate: todayISO(),
      slot: "14:30-15:30",
      status: "已預約",
      consent: false,
      noticeStatus: "不需通知",
      followupStatus: "已完成",
      reminderNote: "",
      note: ""
    }
  ]
};

const statuses = ["已預約", "已報到", "等待檢驗", "檢驗中", "檢驗完成", "未通過待處理", "覆驗", "已離場", "未到", "已取消"];
const noticeStatuses = ["尚未通知", "已通知", "未接通", "已回覆", "不需通知"];
const followupStatuses = ["待處理", "已預約", "需再追蹤", "暫緩", "已完成"];
let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(raw);
    parsed.selectedDate = parsed.selectedDate || todayISO();
    parsed.bookings = (parsed.bookings || []).map((booking) => ({
      ...booking,
      bookingDate: booking.bookingDate || todayISO(),
      noticeStatus: booking.noticeStatus || "尚未通知",
      followupStatus: booking.followupStatus || "待處理",
      reminderNote: booking.reminderNote || ""
    }));
    parsed.slots = parsed.slots || structuredClone(defaultState.slots);
    return parsed;
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getAgeYears(manufactured) {
  if (!manufactured || !/^\d{4}-\d{2}$/.test(manufactured)) return null;
  const [year, month] = manufactured.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month) age -= 1;
  return Math.max(age, 0);
}

function getInspectionRule(manufactured) {
  const age = getAgeYears(manufactured);
  if (age === null) return { age: "-", label: "未填出廠年月", months: 0, text: "待補資料" };
  if (age < 5) return { age, label: "未滿 5 年", months: 0, text: "免定期檢驗" };
  if (age < 10) return { age, label: "5-10 年", months: 12, text: "每年一次" };
  return { age, label: "10 年以上", months: 6, text: "每年二次" };
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function makeSlotTime(start, end) {
  return `${start}-${end}`;
}

function splitSlotTime(time) {
  const [start = "09:00", end = "10:00"] = time.split("-");
  return { start, end };
}

function sortSlots() {
  state.slots.sort((a, b) => a.time.localeCompare(b.time));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getNextInspectionDate(booking) {
  if (booking.nextInspectionDate) return booking.nextInspectionDate;
  const rule = getInspectionRule(booking.manufactured);
  if (!rule.months) return "尚免定檢";
  return formatDate(addMonths(new Date(), rule.months));
}

function normalizeExcelDate(value) {
  if (!value) return "";
  if (value instanceof Date) return formatDate(value);
  const text = String(value).trim().replaceAll("/", "-");
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [year, month, day] = text.split("-").map((part) => part.padStart(2, "0"));
    return `${year}-${month}-${day}`;
  }
  if (/^\d{4}-\d{1,2}$/.test(text)) {
    const [year, month] = text.split("-");
    return `${year}-${month.padStart(2, "0")}`;
  }
  return text;
}

function normalizeManufacturedMonth(value) {
  const text = normalizeExcelDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(text)) return text;
  return "";
}

function parseConsent(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["同意", "是", "yes", "y", "true", "1"].includes(text);
}

function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && String(row[name]).trim() !== "") return String(row[name]).trim();
  }
  return "";
}

function getSelectedDateBookings() {
  return state.bookings.filter((booking) => booking.bookingDate === state.selectedDate);
}

function getSlotUsage(slot, date = state.selectedDate) {
  const active = state.bookings.filter((booking) => booking.bookingDate === date && booking.slot === slot.time && !["已取消", "未到"].includes(booking.status));
  const online = active.length;
  const totalCapacity = slot.onlineCapacity + slot.walkInReserve;
  const percent = Math.min(Math.round((online / totalCapacity) * 100), 100);
  let label = "空閒";
  let tone = "open";
  if (percent >= 90) {
    label = "滿載";
    tone = "full";
  } else if (percent >= 70) {
    label = "忙碌";
    tone = "busy";
  } else if (percent >= 45) {
    label = "普通";
    tone = "normal";
  }
  return { online, totalCapacity, percent, label, tone };
}

function render() {
  renderToday();
  renderMetrics();
  renderSlots();
  renderQueue();
  renderBookingSlots();
  renderPublicBoard();
  renderVehicleTable();
  renderReminders();
  renderCapacityForm();
}

function renderToday() {
  const dateInput = document.querySelector("#operatingDate");
  dateInput.value = state.selectedDate;
  const selected = new Date(`${state.selectedDate}T00:00:00`);
  document.querySelector("#todayText").textContent = selected.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });
  const waiting = getSelectedDateBookings().filter((booking) => ["已報到", "等待檢驗"].includes(booking.status)).length;
  document.querySelector("#currentLoadText").textContent = `現場約等待 ${waiting * 12} 分鐘`;
}

function renderMetrics() {
  const selectedBookings = getSelectedDateBookings();
  const bookings = selectedBookings.filter((booking) => !["已取消"].includes(booking.status));
  const checkedIn = selectedBookings.filter((booking) => !["已預約", "已取消", "未到"].includes(booking.status));
  const waiting = selectedBookings.filter((booking) => ["已報到", "等待檢驗"].includes(booking.status));
  document.querySelector("#metricBookings").textContent = bookings.length;
  document.querySelector("#metricCheckedIn").textContent = checkedIn.length;
  document.querySelector("#metricWaiting").textContent = waiting.length;
  document.querySelector("#metricReminders").textContent = getReminderBookings().length;
}

function renderSlots() {
  const list = document.querySelector("#slotList");
  const template = document.querySelector("#slotTemplate");
  list.innerHTML = "";
  state.slots.forEach((slot) => {
    const usage = getSlotUsage(slot);
    const node = template.content.cloneNode(true);
    node.querySelector(".slot-time").textContent = slot.time;
    node.querySelector(".slot-count").textContent = `${usage.online} / ${usage.totalCapacity} 台，線上上限 ${slot.onlineCapacity}`;
    node.querySelector(".slot-meter span").style.width = `${usage.percent}%`;
    const badge = node.querySelector(".badge");
    badge.textContent = usage.label;
    badge.className = `badge ${usage.tone}`;
    list.appendChild(node);
  });
}

function renderWorkorderCard(booking, compact = false) {
  const options = statuses.map((status) => `<option ${status === booking.status ? "selected" : ""}>${status}</option>`).join("");
  return `
    <article class="queue-item ${compact ? "compact-item" : ""}">
      <div>
        <strong>${booking.plate}｜${booking.owner}</strong>
        <small>${booking.bookingDate}｜${booking.slot}｜${booking.type}｜${booking.phone}</small>
      </div>
      <select class="status-select" data-id="${booking.id}">${options}</select>
    </article>
  `;
}

function getActiveWorkorders() {
  return getSelectedDateBookings().filter((booking) => !["已取消", "已離場"].includes(booking.status));
}

function renderQueue() {
  const dashboardList = document.querySelector("#dashboardQueueList");
  const workorderList = document.querySelector("#workorderList");
  const active = getActiveWorkorders();
  const empty = `<article class="queue-item"><div><strong>目前沒有當日工單</strong><small>新增該日期預約後會出現在這裡。</small></div></article>`;

  dashboardList.innerHTML = active.slice(0, 4).map((booking) => renderWorkorderCard(booking, true)).join("") || empty;
  workorderList.innerHTML = active.map((booking) => renderWorkorderCard(booking)).join("") || empty;
  document.querySelector("#workorderDateText").textContent = state.selectedDate;
}

function renderBookingSlots() {
  const select = document.querySelector("#bookingSlot");
  const bookingDate = document.querySelector("#bookingDate").value || state.selectedDate;
  if (!state.slots.length) {
    select.innerHTML = `<option disabled selected>尚未建立可預約時段</option>`;
    return;
  }
  select.innerHTML = state.slots.map((slot) => {
    const usage = getSlotUsage(slot, bookingDate);
    return `<option value="${slot.time}" ${usage.tone === "full" ? "disabled" : ""}>${slot.time}｜${usage.label}｜${usage.online}/${usage.totalCapacity}</option>`;
  }).join("");
}

function renderPublicBoard() {
  const board = document.querySelector("#publicBoard");
  board.innerHTML = state.slots.map((slot) => {
    const usage = getSlotUsage(slot, state.selectedDate);
    const suggestion = usage.tone === "full" ? "建議改選其他時段" : usage.tone === "busy" ? "可能需要等待" : "適合預約或前往";
    return `
      <article class="public-item">
        <div>
          <strong>${slot.time}</strong>
          <small>${suggestion}</small>
        </div>
        <span class="badge ${usage.tone}">${usage.label}</span>
      </article>
    `;
  }).join("");
}

function renderVehicleTable() {
  const keyword = document.querySelector("#vehicleSearch").value.trim().toLowerCase();
  const vehicles = new Map();
  state.bookings.forEach((booking) => {
    const current = vehicles.get(booking.plate);
    if (!current || booking.bookingDate > current.bookingDate) {
      vehicles.set(booking.plate, booking);
    }
  });

  const rows = Array.from(vehicles.values())
    .filter((booking) => `${booking.plate} ${booking.owner} ${booking.phone}`.toLowerCase().includes(keyword))
    .sort((a, b) => a.plate.localeCompare(b.plate))
    .map((booking) => {
      const rule = getInspectionRule(booking.manufactured);
      return `
        <tr>
          <td><strong>${booking.plate}</strong></td>
          <td>${booking.owner}</td>
          <td>${booking.phone}</td>
          <td>${booking.bookingDate}</td>
          <td>${rule.age === "-" ? "待補" : `${rule.age} 年`}</td>
          <td>${rule.text}</td>
          <td>${getNextInspectionDate(booking)}</td>
          <td>${booking.consent ? "同意" : "未同意"}</td>
        </tr>
      `;
    }).join("");
  document.querySelector("#vehicleTable").innerHTML = rows || `<tr><td colspan="8">找不到符合資料</td></tr>`;
}

function getReminderBookings() {
  return state.bookings.filter((booking) => {
    const rule = getInspectionRule(booking.manufactured);
    return booking.consent && (rule.months > 0 || booking.nextInspectionDate) && !["已取消", "未到"].includes(booking.status);
  });
}

async function importVehicleWorkbook(file) {
  const result = document.querySelector("#vehicleImportResult");
  if (!window.XLSX) {
    result.textContent = "Excel 匯入工具尚未載入，請確認網路連線後重新整理。";
    return;
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes("車籍資料匯入") ? "車籍資料匯入" : workbook.SheetNames[0];
  const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
  let imported = 0;
  let skipped = 0;

  rows.forEach((row) => {
    const plate = pick(row, ["車牌號碼", "車牌", "牌照號碼"]).toUpperCase();
    if (!plate) {
      skipped += 1;
      return;
    }

    state.bookings = state.bookings.filter((booking) => !(booking.source === "excel" && booking.plate === plate));
    state.bookings.push({
      id: `XLSX${Date.now()}${imported}`,
      source: "excel",
      plate,
      owner: pick(row, ["車主姓名", "車主", "姓名"]) || "未填寫",
      phone: pick(row, ["手機", "電話", "聯絡電話"]),
      type: pick(row, ["車種", "車輛種類"]) || "自用小客車",
      manufactured: normalizeManufacturedMonth(pick(row, ["出廠年月", "出廠日期"])),
      firstLicenseDate: normalizeExcelDate(pick(row, ["初次領牌日", "領牌日"])),
      lastInspectionDate: normalizeExcelDate(pick(row, ["上次檢驗日", "最近檢驗日"])),
      nextInspectionDate: normalizeExcelDate(pick(row, ["下次檢驗日", "下次建議日"])),
      bookingDate: normalizeExcelDate(pick(row, ["上次檢驗日", "最近檢驗日"])) || todayISO(),
      slot: "資料匯入",
      status: "已離場",
      consent: parseConsent(pick(row, ["通知同意", "提醒同意"])),
      notificationMethod: pick(row, ["通知方式", "偏好通知方式"]),
      email: pick(row, ["Email", "電子郵件"]),
      address: pick(row, ["地址"]),
      identitySuffix: pick(row, ["身分證末四碼"]),
      vinSuffix: pick(row, ["車身號碼末四碼"]),
      fuel: pick(row, ["燃料種類"]),
      displacement: pick(row, ["排氣量"]),
      noticeStatus: "尚未通知",
      followupStatus: "待處理",
      reminderNote: "",
      note: pick(row, ["備註", "說明"])
    });
    imported += 1;
  });

  saveState();
  render();
  result.textContent = `已匯入 ${imported} 筆車籍資料${skipped ? `，略過 ${skipped} 筆未填車牌資料` : ""}。`;
}

function renderReminders() {
  const list = document.querySelector("#reminderList");
  const reminders = getReminderBookings();
  list.innerHTML = reminders.map((booking) => {
    const rule = getInspectionRule(booking.manufactured);
    const noticeOptions = noticeStatuses.map((status) => `<option ${status === booking.noticeStatus ? "selected" : ""}>${status}</option>`).join("");
    const followupOptions = followupStatuses.map((status) => `<option ${status === booking.followupStatus ? "selected" : ""}>${status}</option>`).join("");
    return `
      <article class="reminder-item">
        <div>
          <strong>${booking.plate}｜${booking.owner}</strong>
          <small>${booking.phone}｜${rule.text}｜下次建議 ${getNextInspectionDate(booking)}</small>
        </div>
        <div class="reminder-actions">
          <label>
            <span>通知狀態</span>
            <select data-reminder-field="noticeStatus" data-id="${booking.id}">${noticeOptions}</select>
          </label>
          <label>
            <span>後續處理</span>
            <select data-reminder-field="followupStatus" data-id="${booking.id}">${followupOptions}</select>
          </label>
          <label class="reminder-note">
            <span>追蹤備註</span>
            <input data-reminder-field="reminderNote" data-id="${booking.id}" value="${booking.reminderNote || ""}" placeholder="例如：已電話通知、下週再聯絡">
          </label>
        </div>
      </article>
    `;
  }).join("") || `<article class="reminder-item"><div><strong>目前沒有提醒名單</strong><small>新增有通知同意的車輛後會出現在這裡。</small></div></article>`;
}

function renderCapacityForm() {
  const form = document.querySelector("#capacityForm");
  form.innerHTML = state.slots.map((slot, index) => `
    <div class="capacity-item" data-index="${index}" data-original-time="${slot.time}">
      <div class="capacity-head">
        <strong>${slot.time}</strong>
        <button class="danger-btn" type="button" data-action="delete-slot" data-index="${index}">刪除</button>
      </div>
      <div class="capacity-fields">
        <label>
          <span>開始時間</span>
          <input type="time" value="${splitSlotTime(slot.time).start}" data-index="${index}" data-field="startTime">
        </label>
        <label>
          <span>結束時間</span>
          <input type="time" value="${splitSlotTime(slot.time).end}" data-index="${index}" data-field="endTime">
        </label>
        <label>
          <span>線上上限</span>
          <input type="number" min="0" value="${slot.onlineCapacity}" data-index="${index}" data-field="onlineCapacity">
        </label>
        <label>
          <span>現場保留</span>
          <input type="number" min="0" value="${slot.walkInReserve}" data-index="${index}" data-field="walkInReserve">
        </label>
      </div>
    </div>
  `).join("") || `<div class="capacity-item"><strong>尚未建立時段</strong><p>請先按「新增時段」，建立廠家的可預約時段。</p></div>`;
}

function bindEvents() {
  document.querySelectorAll(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.view}`).classList.add("active");
    });
  });

  document.querySelector("#operatingDate").addEventListener("change", (event) => {
    state.selectedDate = event.target.value || todayISO();
    document.querySelector("#bookingDate").value = state.selectedDate;
    saveState();
    render();
  });

  document.querySelector("#bookingDate").addEventListener("change", renderBookingSlots);

  document.querySelector("#bookingForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = `B${Date.now()}`;
    state.bookings.push({
      id,
      plate: form.get("plate").trim().toUpperCase(),
      owner: form.get("owner").trim(),
      phone: form.get("phone").trim(),
      type: form.get("type"),
      manufactured: form.get("manufactured"),
      bookingDate: form.get("bookingDate"),
      slot: form.get("slot"),
      status: "已預約",
      consent: form.get("consent") === "on",
      noticeStatus: "尚未通知",
      followupStatus: "待處理",
      reminderNote: "",
      note: form.get("note").trim()
    });
    event.currentTarget.reset();
    document.querySelector("#bookingDate").value = state.selectedDate;
    saveState();
    render();
    document.querySelector('[data-view="dashboard"]').click();
  });

  document.addEventListener("change", (event) => {
    if (!event.target.matches(".status-select")) return;
    const booking = state.bookings.find((item) => item.id === event.target.dataset.id);
    if (booking) {
      booking.status = event.target.value;
      saveState();
      render();
    }
  });

  document.querySelector("#reminderList").addEventListener("change", (event) => {
    const field = event.target.dataset.reminderField;
    if (!field || field === "reminderNote") return;
    const booking = state.bookings.find((item) => item.id === event.target.dataset.id);
    if (booking) {
      booking[field] = event.target.value;
      saveState();
      renderMetrics();
    }
  });

  document.querySelector("#reminderList").addEventListener("input", (event) => {
    const field = event.target.dataset.reminderField;
    if (field !== "reminderNote") return;
    const booking = state.bookings.find((item) => item.id === event.target.dataset.id);
    if (booking) {
      booking[field] = event.target.value;
      saveState();
    }
  });

  document.querySelector("#vehicleSearch").addEventListener("input", renderVehicleTable);

  document.querySelector("#vehicleImportFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await importVehicleWorkbook(file);
    } catch (error) {
      document.querySelector("#vehicleImportResult").textContent = `匯入失敗：${error.message}`;
    } finally {
      event.target.value = "";
    }
  });

  document.querySelector("#addSlot").addEventListener("click", () => {
    const defaultStart = state.slots.at(-1) ? splitSlotTime(state.slots.at(-1).time).end : "09:00";
    const defaultEnd = defaultStart < "23:00" ? `${String(Number(defaultStart.slice(0, 2)) + 1).padStart(2, "0")}:${defaultStart.slice(3)}` : "23:59";
    state.slots.push({
      time: makeSlotTime(defaultStart, defaultEnd),
      onlineCapacity: 6,
      walkInReserve: 2
    });
    sortSlots();
    saveState();
    render();
  });

  document.querySelector("#capacityForm").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='delete-slot']");
    if (!button) return;
    const index = Number(button.dataset.index);
    const slot = state.slots[index];
    const relatedBookings = state.bookings.filter((booking) => booking.slot === slot.time && !["已取消"].includes(booking.status));
    if (relatedBookings.length && !confirm(`${slot.time} 已有 ${relatedBookings.length} 筆預約或紀錄，確定要刪除這個時段嗎？`)) {
      return;
    }
    state.slots.splice(index, 1);
    saveState();
    render();
  });

  document.querySelector("#saveCapacity").addEventListener("click", () => {
    const nextSlots = [];
    const timeChanges = [];
    const items = Array.from(document.querySelectorAll("#capacityForm .capacity-item[data-index]"));

    for (const item of items) {
      const index = Number(item.dataset.index);
      const originalTime = item.dataset.originalTime;
      const start = item.querySelector("[data-field='startTime']").value;
      const end = item.querySelector("[data-field='endTime']").value;
      const onlineCapacity = Math.max(Number(item.querySelector("[data-field='onlineCapacity']").value), 0);
      const walkInReserve = Math.max(Number(item.querySelector("[data-field='walkInReserve']").value), 0);

      if (!start || !end || start >= end) {
        alert("請確認每個時段都有正確的開始與結束時間，且結束時間要晚於開始時間。");
        return;
      }

      const nextTime = makeSlotTime(start, end);
      nextSlots.push({ time: nextTime, onlineCapacity, walkInReserve });

      if (state.slots[index] && originalTime !== nextTime) {
        timeChanges.push({ from: originalTime, to: nextTime });
      }
    }

    const duplicateTimes = nextSlots
      .map((slot) => slot.time)
      .filter((time, index, all) => all.indexOf(time) !== index);

    if (duplicateTimes.length) {
      alert("時段不可重複，請調整後再儲存。");
      return;
    }

    timeChanges.forEach((change) => {
      state.bookings.forEach((booking) => {
        if (booking.slot === change.from) booking.slot = change.to;
      });
    });

    state.slots = nextSlots;
    sortSlots();
    saveState();
    render();
  });
}

bindEvents();
document.querySelector("#bookingDate").value = state.selectedDate;
render();
