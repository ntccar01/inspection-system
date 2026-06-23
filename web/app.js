const STORAGE_KEY = "inspection-yard-mvp-state-v1";

const defaultState = {
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
      slot: "09:00-10:00",
      status: "已報到",
      consent: true,
      note: "電話預約補登"
    },
    {
      id: "B20260623002",
      plate: "KLD-8899",
      owner: "林小姐",
      phone: "0988-222-123",
      type: "自用小客車",
      manufactured: "2019-11",
      slot: "10:00-11:00",
      status: "等待檢驗",
      consent: true,
      note: ""
    },
    {
      id: "B20260623003",
      plate: "TX-5678",
      owner: "陳先生",
      phone: "0975-111-888",
      type: "自用小貨車",
      manufactured: "2012-03",
      slot: "10:00-11:00",
      status: "檢驗中",
      consent: true,
      note: "十年以上車輛"
    },
    {
      id: "B20260623004",
      plate: "NQH-2301",
      owner: "黃小姐",
      phone: "0933-876-655",
      type: "自用小客車",
      manufactured: "2020-08",
      slot: "14:30-15:30",
      status: "已預約",
      consent: false,
      note: ""
    }
  ]
};

const statuses = ["已預約", "已報到", "等待檢驗", "檢驗中", "檢驗完成", "未通過待處理", "覆驗", "已離場", "未到", "已取消"];
let state = loadState();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(defaultState);
  try {
    return JSON.parse(raw);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getAgeYears(manufactured) {
  const [year, month] = manufactured.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month) age -= 1;
  return Math.max(age, 0);
}

function getInspectionRule(manufactured) {
  const age = getAgeYears(manufactured);
  if (age < 5) return { age, label: "未滿 5 年", months: 0, text: "免定期檢驗" };
  if (age < 10) return { age, label: "5-10 年", months: 12, text: "每年一次" };
  return { age, label: "10 年以上", months: 6, text: "每年二次" };
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getNextInspectionDate(booking) {
  const rule = getInspectionRule(booking.manufactured);
  if (!rule.months) return "尚免定檢";
  return formatDate(addMonths(new Date(), rule.months));
}

function getSlotUsage(slot) {
  const active = state.bookings.filter((booking) => booking.slot === slot.time && !["已取消", "未到"].includes(booking.status));
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
  const now = new Date();
  document.querySelector("#todayText").textContent = now.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long"
  });
  const waiting = state.bookings.filter((booking) => ["已報到", "等待檢驗"].includes(booking.status)).length;
  document.querySelector("#currentLoadText").textContent = `現場約等待 ${waiting * 12} 分鐘`;
}

function renderMetrics() {
  const bookings = state.bookings.filter((booking) => !["已取消"].includes(booking.status));
  const checkedIn = state.bookings.filter((booking) => !["已預約", "已取消", "未到"].includes(booking.status));
  const waiting = state.bookings.filter((booking) => ["已報到", "等待檢驗"].includes(booking.status));
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

function renderQueue() {
  const list = document.querySelector("#queueList");
  const active = state.bookings.filter((booking) => !["已取消", "已離場"].includes(booking.status));
  list.innerHTML = active.map((booking) => {
    const options = statuses.map((status) => `<option ${status === booking.status ? "selected" : ""}>${status}</option>`).join("");
    return `
      <article class="queue-item">
        <div>
          <strong>${booking.plate}｜${booking.owner}</strong>
          <small>${booking.slot}｜${booking.type}｜${booking.phone}</small>
        </div>
        <select class="status-select" data-id="${booking.id}">${options}</select>
      </article>
    `;
  }).join("");
}

function renderBookingSlots() {
  const select = document.querySelector("#bookingSlot");
  select.innerHTML = state.slots.map((slot) => {
    const usage = getSlotUsage(slot);
    return `<option value="${slot.time}" ${usage.tone === "full" ? "disabled" : ""}>${slot.time}｜${usage.label}｜${usage.online}/${usage.totalCapacity}</option>`;
  }).join("");
}

function renderPublicBoard() {
  const board = document.querySelector("#publicBoard");
  board.innerHTML = state.slots.map((slot) => {
    const usage = getSlotUsage(slot);
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
  const rows = state.bookings
    .filter((booking) => `${booking.plate} ${booking.owner} ${booking.phone}`.toLowerCase().includes(keyword))
    .map((booking) => {
      const rule = getInspectionRule(booking.manufactured);
      return `
        <tr>
          <td><strong>${booking.plate}</strong></td>
          <td>${booking.owner}</td>
          <td>${booking.phone}</td>
          <td>${rule.age} 年</td>
          <td>${rule.text}</td>
          <td>${getNextInspectionDate(booking)}</td>
          <td>${booking.status}</td>
        </tr>
      `;
    }).join("");
  document.querySelector("#vehicleTable").innerHTML = rows || `<tr><td colspan="7">找不到符合資料</td></tr>`;
}

function getReminderBookings() {
  return state.bookings.filter((booking) => {
    const rule = getInspectionRule(booking.manufactured);
    return booking.consent && rule.months > 0 && !["已取消", "未到"].includes(booking.status);
  });
}

function renderReminders() {
  const list = document.querySelector("#reminderList");
  const reminders = getReminderBookings();
  list.innerHTML = reminders.map((booking) => {
    const rule = getInspectionRule(booking.manufactured);
    return `
      <article class="reminder-item">
        <div>
          <strong>${booking.plate}｜${booking.owner}</strong>
          <small>${booking.phone}｜${rule.text}｜下次建議 ${getNextInspectionDate(booking)}</small>
        </div>
        <span class="badge normal">可通知</span>
      </article>
    `;
  }).join("") || `<article class="reminder-item"><div><strong>目前沒有提醒名單</strong><small>新增有通知同意的車輛後會出現在這裡。</small></div></article>`;
}

function renderCapacityForm() {
  const form = document.querySelector("#capacityForm");
  form.innerHTML = state.slots.map((slot, index) => `
    <div class="capacity-item">
      <strong>${slot.time}</strong>
      <div class="capacity-fields">
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
  `).join("");
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
      slot: form.get("slot"),
      status: "已預約",
      consent: form.get("consent") === "on",
      note: form.get("note").trim()
    });
    event.currentTarget.reset();
    saveState();
    render();
    document.querySelector('[data-view="dashboard"]').click();
  });

  document.querySelector("#queueList").addEventListener("change", (event) => {
    if (!event.target.matches(".status-select")) return;
    const booking = state.bookings.find((item) => item.id === event.target.dataset.id);
    if (booking) {
      booking.status = event.target.value;
      saveState();
      render();
    }
  });

  document.querySelector("#vehicleSearch").addEventListener("input", renderVehicleTable);

  document.querySelector("#saveCapacity").addEventListener("click", () => {
    document.querySelectorAll("#capacityForm input").forEach((input) => {
      const slot = state.slots[Number(input.dataset.index)];
      slot[input.dataset.field] = Math.max(Number(input.value), 0);
    });
    saveState();
    render();
  });
}

bindEvents();
render();
