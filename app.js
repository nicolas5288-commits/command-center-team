/* ============================================================
   指揮中心 · Command Center
   純靜態 + localStorage。資料層集中在 store 物件——
   第二階段接 Supabase 時只要抽換 load()/persist() 即可（§11 預留）。
   ============================================================ */
"use strict";

/* ---------- 小工具 ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad2 = n => String(n).padStart(2, "0");
const fmtDate = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const WEEK_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/* 工作日換日線 = 凌晨 4 點 */
function workNow() {
  const n = new Date();
  if (n.getHours() < 4) n.setDate(n.getDate() - 1);
  return n;
}
const todayStr = () => fmtDate(workNow());
const isMidnight = () => new Date().getHours() < 4;

function fmtMD(s) { const d = parseDate(s); return `${d.getMonth() + 1}/${d.getDate()}（週${WEEK_ZH[d.getDay()]}）`; }
function fmtDur(min) {
  if (!min) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h}h${m}m` : `${h}h`) : `${m}m`;
}
function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
function extractUrls(text) { return (String(text || "").match(/https?:\/\/[^\s<]+/g)) || []; }

/* ---------- 資料層 ---------- */
const LS_KEY = "cc_data_v2";
const DEFAULT_CATS = ["內容", "工具", "合作", "學習", "其他"];

const store = {
  projects: [], categories: [...DEFAULT_CATS], schedule: [], members: [], activity: [], dataVersion: 0,
  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) { this.seed(); return; }
      const d = JSON.parse(raw);
      this.projects = Array.isArray(d.projects) ? d.projects : [];
      this.categories = Array.isArray(d.categories) && d.categories.length ? d.categories : [...DEFAULT_CATS];
      this.schedule = Array.isArray(d.schedule) ? d.schedule : [];
      this.members = Array.isArray(d.members) ? d.members : [];
      this.activity = Array.isArray(d.activity) ? d.activity : [];
      this.dataVersion = d.dataVersion || 0;
    } catch (e) { console.warn("資料損毀，回復預設", e); this.seed(); }
  },
  seed() {
    const t = todayStr();
    const plus = n => { const d = parseDate(t); d.setDate(d.getDate() + n); return fmtDate(d); };
    this.projects = [
      { id: uid(), name: "（範例）客戶品牌官網改版", category: "合作", status: "active", priority: 1, deadline: plus(3), notes: "這是假資料，可直接刪除。\n參考 https://example.com", doneAt: null, tasks: [{ id: uid(), text: "首頁 wireframe", done: true, doneAt: t }, { id: uid(), text: "配色提案", done: false, doneAt: null }, { id: uid(), text: "RWD 檢查", done: false, doneAt: null }] },
      { id: uid(), name: "（範例）IG 連載企劃", category: "內容", status: "planning", priority: 0, deadline: plus(10), notes: "假資料：先拆 5 集主題", doneAt: null, tasks: [{ id: uid(), text: "列 10 個題目", done: false, doneAt: null }] },
      { id: uid(), name: "（範例）剪片流程自動化", category: "工具", status: "paused", priority: 0, deadline: "", notes: "假資料：等新版 API", doneAt: null, tasks: [] },
      { id: uid(), name: "（範例）短影音課程", category: "學習", status: "done", priority: 0, deadline: plus(-2), notes: "假資料：已完成的樣子", doneAt: plus(-1), tasks: [{ id: uid(), text: "看完第一章", done: true, doneAt: plus(-1) }] },
    ];
    this.categories = [...DEFAULT_CATS];
    this.schedule = [];
    this.members = [];
    this.activity = [];
    this.persist(false);
  },
  toJSON() {
    return { version: 2, dataVersion: this.dataVersion, projects: this.projects, categories: this.categories, schedule: this.schedule, members: this.members, activity: this.activity };
  },
  persist(bump = true) {
    if (bump) this.dataVersion = Date.now();
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.toJSON())); } catch (e) { console.error(e); }
  },
  replaceAll(d) {
    this.projects = d.projects || []; this.categories = d.categories?.length ? d.categories : [...DEFAULT_CATS];
    this.schedule = d.schedule || []; this.members = Array.isArray(d.members) ? d.members : [];
    this.activity = Array.isArray(d.activity) ? d.activity : [];
    this.dataVersion = d.dataVersion || Date.now();
    localStorage.setItem(LS_KEY, JSON.stringify(this.toJSON()));
  },
};

function commit() {           // 所有變動的統一出口
  store.persist();
  renderAll();
  cloud.push();
}

/* 工作日誌：記一筆關鍵動作。務必在該動作的 commit() 之前呼叫 */
const LOG_CAP = 300;
function logAction(kind, text) {
  const actor = cloud.user ? (cloud.user.email || "user").split("@")[0] : "我";
  store.activity.push({ id: uid(), ts: new Date().toISOString(), actor, kind, text });
  if (store.activity.length > LOG_CAP) {
    store.activity.sort((a, b) => a.ts < b.ts ? -1 : 1);
    store.activity.splice(0, store.activity.length - LOG_CAP);   // 移除最舊，diff push 會自動刪雲端列
  }
}

const project = id => store.projects.find(p => p.id === id);
const scheduleItem = id => store.schedule.find(s => s.id === id);
const executorOf = pid => store.members.find(m => m.currentProjectId === pid);
function progressOf(p) {
  if (p.status === "done") return 100;
  if (!p.tasks.length) return 0;
  return Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100);
}

/* ---------- 全域 UI state ---------- */
let selectedProjectId = null;
let analysisProjectId = null;   // 右欄詳情目前顯示的專案（掃描完成才有值；null = 空狀態）
let filterCat = "all", filterStatus = "all";
let kanbanCat = "all";          // 看板的分類篩選（跟左欄清單的 filterCat 各自獨立）
let taskInputOpen = false;
let currentPage = "kanban";     // "board" | "calendar" | "kanban"（看板＝首頁）
let calOpen = false, calCursor = null, calSelectedDate = null;
let scanTimer = null;
let teamOpen = false;
let logOpen = false;
let pickingProjectId = null;    // 開始執行 → 成員選單指向的專案
let onlineList = [];            // 目前在線的登入者顯示名（原樣）
let onlineLower = new Set();    // 在線名小寫集合（拿來比對成員卡）
let onlineCount = 0;

/* ============================================================
   循環模板 → 實例生成（開站檢查，回補最多 3 天）
   ============================================================ */
function repeatMatches(tpl, dateStr) {
  if (dateStr < tpl.date) return false;
  const d = parseDate(dateStr), a = parseDate(tpl.date);
  if (tpl.repeat === "daily") return true;
  if (tpl.repeat === "weekly") return d.getDay() === a.getDay();
  if (tpl.repeat === "monthly") return d.getDate() === a.getDate();
  return false;
}
function generateRepeatInstances() {
  const today = todayStr();
  let changed = false;
  for (const tpl of store.schedule.filter(s => s.repeat)) {
    const from = tpl.genUpTo || fmtDate(new Date(parseDate(tpl.date).getTime() - 86400000));
    for (let off = 2; off >= 0; off--) {
      const d = parseDate(today); d.setDate(d.getDate() - off);
      const ds = fmtDate(d);
      if (ds <= from || !repeatMatches(tpl, ds)) continue;
      store.schedule.push({ id: uid(), date: ds, time: tpl.time, durationMin: tpl.durationMin, repeat: "", fromRepeat: tpl.id, text: tpl.text, done: false, doneAt: null });
      changed = true;
    }
    if (tpl.genUpTo !== today) { tpl.genUpTo = today; changed = true; }
  }
  if (changed) store.persist(false);
}

/* ============================================================
   Toast（刪除可復原）
   ============================================================ */
function toast(msg, undoFn) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (undoFn) {
    const b = document.createElement("button");
    b.className = "undo"; b.textContent = "復原";
    b.onclick = () => { undoFn(); el.remove(); };
    el.appendChild(b);
  }
  $("#toastWrap").appendChild(el);
  setTimeout(() => el.remove(), undoFn ? 8000 : 3500);
}

/* ============================================================
   專案 CRUD
   ============================================================ */
function sortedProjects() {
  let list = store.projects.filter(p =>
    (filterCat === "all" || p.category === filterCat) &&
    (filterStatus === "all" || p.status === filterStatus));
  return list.sort((a, b) => {
    const ad = a.status === "done", bd = b.status === "done";
    if (ad !== bd) return ad ? 1 : -1;                 // 已完成墊底
    if (!ad) {
      if (a.priority !== b.priority) return b.priority - a.priority;  // ⭐ 釘頂
      const aD = a.deadline || "9999-99-99", bD = b.deadline || "9999-99-99";
      if (aD !== bD) return aD < bD ? -1 : 1;          // 截止近的在前，沒截止靠後
    }
    return 0;
  });
}
const STATUS_ZH = { planning: "規劃中", active: "進行中", paused: "暫停", done: "已完成" };

function deleteProject(id) {
  const idx = store.projects.findIndex(p => p.id === id);
  if (idx < 0) return;
  const [removed] = store.projects.splice(idx, 1);
  const removedSched = store.schedule.filter(s => s.ref?.projectId === id);
  store.schedule = store.schedule.filter(s => s.ref?.projectId !== id);
  const freedMembers = store.members.filter(m => m.currentProjectId === id);   // 執行者放回待命
  for (const m of freedMembers) { m.currentProjectId = null; m.startedAt = null; }
  if (selectedProjectId === id) selectedProjectId = null;
  if (analysisProjectId === id) analysisProjectId = null;
  logAction("delete", `刪除專案「${removed.name}」`);
  commit();
  toast(`已刪除「${removed.name}」`, () => {
    store.projects.splice(idx, 0, removed);
    store.schedule.push(...removedSched);
    for (const m of freedMembers) { m.currentProjectId = id; m.startedAt = todayStr(); }
    logAction("restore", `復原專案「${removed.name}」`);
    commit();
  });
}
function toggleProjectDone(id) {
  const p = project(id); if (!p) return;
  if (p.status === "done") { p.status = "active"; p.doneAt = null; logAction("undone", `把「${p.name}」恢復進行中`); toast(`「${p.name}」恢復進行中`); }
  else { p.status = "done"; p.doneAt = todayStr(); logAction("done", `完成專案「${p.name}」`); toast(`完成「${p.name}」`); }
  commit();
}

/* 專案 Modal */
let editingProjectId = null;
function openProjectModal(id = null, presetDeadline = "", presetStatus = "") {
  editingProjectId = id;
  const p = id ? project(id) : null;
  $("#projectModalTitle").textContent = p ? "編輯專案" : "新增專案";
  $("#pmCategory").innerHTML = store.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  $("#pmName").value = p?.name || "";
  $("#pmCategory").value = p?.category || store.categories[0];
  $("#pmStatus").value = p?.status || presetStatus || "active";
  $("#pmPriority").value = String(p?.priority ?? 0);
  $("#pmDeadline").value = p?.deadline || presetDeadline;
  $("#pmNotes").value = p?.notes || "";
  $("#projectModal").hidden = false;
  $("#pmName").focus();
}
function saveProjectModal() {
  const name = $("#pmName").value.trim();
  if (!name) { $("#pmName").focus(); return; }
  const vals = {
    name, category: $("#pmCategory").value, status: $("#pmStatus").value,
    priority: Number($("#pmPriority").value), deadline: $("#pmDeadline").value, notes: $("#pmNotes").value,
  };
  if (editingProjectId) {
    const p = project(editingProjectId);
    const wasDone = p.status === "done";
    Object.assign(p, vals);
    if (p.status === "done" && !wasDone) p.doneAt = todayStr();
    if (p.status !== "done") p.doneAt = null;
  } else {
    store.projects.push({ id: uid(), ...vals, doneAt: vals.status === "done" ? todayStr() : null, tasks: [] });
    logAction("create", `新增專案「${name}」`);
  }
  $("#projectModal").hidden = true;
  commit();
}

/* ============================================================
   任務
   ============================================================ */
function toggleTask(pid, tid) {
  const p = project(pid); const t = p?.tasks.find(t => t.id === tid); if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? todayStr() : null;
  if (t.done) logAction("done", `完成任務「${t.text}」（${p.name}）`);   // 只記完成，取消不記
  // 雙向同步：連動排程項
  for (const s of store.schedule) {
    if (s.ref?.projectId === pid && s.ref?.taskId === tid && s.done !== t.done) {
      s.done = t.done; s.doneAt = t.doneAt;
    }
  }
  commit();
}
function toggleScheduleDone(sid) {
  const s = scheduleItem(sid); if (!s) return;
  s.done = !s.done;
  s.doneAt = s.done ? todayStr() : null;
  // 勾排程本身的 checkbox 才會進到這裡（勾任務走 toggleTask，兩條路不互相呼叫）→ 完成時記一筆即可
  if (s.done) logAction("done", `完成排程「${s.text}」`);
  if (s.ref) {
    const t = project(s.ref.projectId)?.tasks.find(t => t.id === s.ref.taskId);
    if (t && t.done !== s.done) { t.done = s.done; t.doneAt = s.doneAt; }
  }
  commit();
}
function deleteTask(pid, tid) {
  const p = project(pid); if (!p) return;
  const idx = p.tasks.findIndex(t => t.id === tid);
  const [removed] = p.tasks.splice(idx, 1);
  logAction("delete", `刪除任務「${removed.text}」（${p.name}）`);
  commit();
  toast(`已刪除任務「${removed.text}」`, () => { p.tasks.splice(idx, 0, removed); logAction("restore", `復原任務「${removed.text}」`); commit(); });
}
function taskInTodaySchedule(pid, tid) {
  const t = todayStr();
  return store.schedule.some(s => s.ref?.projectId === pid && s.ref?.taskId === tid && s.date === t);
}
function pushTaskToToday(pid, tid) {
  if (taskInTodaySchedule(pid, tid)) return;
  const p = project(pid); const t = p?.tasks.find(t => t.id === tid); if (!t) return;
  store.schedule.push({ id: uid(), date: todayStr(), time: "", durationMin: 0, repeat: "", text: `${t.text}（${p.name}）`, done: t.done, doneAt: t.doneAt, ref: { projectId: pid, taskId: tid } });
  commit();
  toast(`已排入今天：「${t.text}」`);
}

/* ============================================================
   排程 CRUD + 自然語言快速輸入
   ============================================================ */
function deleteScheduleItem(sid) {
  const idx = store.schedule.findIndex(s => s.id === sid); if (idx < 0) return;
  const [removed] = store.schedule.splice(idx, 1);
  logAction("delete", `刪除排程「${removed.text}」`);
  commit();
  toast(`已刪除「${removed.text}」${removed.repeat ? "（循環模板，未來不再生成）" : ""}`, () => { store.schedule.splice(idx, 0, removed); logAction("restore", `復原排程「${removed.text}」`); commit(); });
}
function deferToToday(sid) {
  const s = scheduleItem(sid); if (!s) return;
  s.date = todayStr(); commit();
}
function deferAllOverdue() {
  const t = todayStr();
  let n = 0;
  for (const s of store.schedule) if (!s.repeat && !s.done && s.date < t) { s.date = t; n++; }
  if (n) { commit(); toast(`已把 ${n} 件積欠順延到今天`); }
}

/* 排程 Modal */
let editingScheduleId = null, scheduleModalPresetDate = "";
function openScheduleModal(sid = null, presetDate = "") {
  editingScheduleId = sid; scheduleModalPresetDate = presetDate;
  const s = sid ? scheduleItem(sid) : null;
  $("#scheduleModalTitle").textContent = s ? "編輯排程" : "新增排程";
  $("#smText").value = s?.text || "";
  $("#smDate").value = s?.date || presetDate || todayStr();
  $("#smTime").value = s?.time || "";
  $("#smDuration").value = s?.durationMin || "";
  $("#smRepeat").value = s?.repeat || "";
  $("#scheduleModal").hidden = false;
  $("#smText").focus();
}
function saveScheduleModal() {
  const text = $("#smText").value.trim();
  if (!text) { $("#smText").focus(); return; }
  const vals = {
    text, date: $("#smDate").value || todayStr(), time: $("#smTime").value || "",
    durationMin: Number($("#smDuration").value) || 0, repeat: $("#smRepeat").value,
  };
  if (editingScheduleId) {
    Object.assign(scheduleItem(editingScheduleId), vals);
  } else {
    const item = { id: uid(), ...vals, done: false, doneAt: null };
    if (item.repeat) item.genUpTo = "";
    store.schedule.push(item);
    logAction("create", `新增排程「${vals.text}」（${vals.date}）`);
  }
  $("#scheduleModal").hidden = true;
  generateRepeatInstances();
  commit();
}

/* --- 自然語言解析 --- */
const CN_NUM = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
function parseQuick(raw) {
  let t = ` ${raw.trim()} `;
  if (!raw.trim()) return null;
  const res = { date: todayStr(), time: "", durationMin: 0, repeat: "", text: "" };
  let m;

  // 循環
  if ((m = t.match(/每天|每日/))) { res.repeat = "daily"; t = t.replace(m[0], " "); }
  else if ((m = t.match(/每[週周]/))) { res.repeat = "weekly"; t = t.replace(m[0], " "); }
  else if ((m = t.match(/每月/))) { res.repeat = "monthly"; t = t.replace(m[0], " "); }

  // 時間 HH:MM
  if ((m = t.match(/(\d{1,2}):(\d{2})/))) {
    res.time = `${pad2(+m[1])}:${m[2]}`; t = t.replace(m[0], " ");
  }
  // 下午X點半 / 晚上8點 / 9點15分
  if (!res.time && (m = t.match(/(上午|早上|中午|下午|晚上)?\s*(\d{1,2})\s*點\s*(半|(\d{1,2})\s*分)?/))) {
    let h = +m[2];
    if ((m[1] === "下午" || m[1] === "晚上" || m[1] === "中午" && h < 11) && h < 12) h += 12;
    if (m[1] === "晚上" && h < 12) h += 12;
    const min = m[3] === "半" ? 30 : (m[4] ? +m[4] : 0);
    res.time = `${pad2(h)}:${pad2(min)}`; t = t.replace(m[0], " ");
  }

  // 時長：1.5小時 / 45分鐘
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*(?:個)?小時/))) { res.durationMin = Math.round(parseFloat(m[1]) * 60); t = t.replace(m[0], " "); }
  if ((m = t.match(/(\d+)\s*分鐘/))) { res.durationMin += +m[1]; t = t.replace(m[0], " "); }

  // 日期
  const base = workNow();
  const offsetDate = n => { const d = new Date(base); d.setDate(d.getDate() + n); return fmtDate(d); };
  if ((m = t.match(/大後天/))) { res.date = offsetDate(3); t = t.replace(m[0], " "); }
  else if ((m = t.match(/後天/))) { res.date = offsetDate(2); t = t.replace(m[0], " "); }
  else if ((m = t.match(/明天/))) { res.date = offsetDate(1); t = t.replace(m[0], " "); }
  else if ((m = t.match(/今天/))) { res.date = offsetDate(0); t = t.replace(m[0], " "); }
  else if ((m = t.match(/(\d+)\s*天後/))) { res.date = offsetDate(+m[1]); t = t.replace(m[0], " "); }
  else if ((m = t.match(/(下?)\s*(?:[週周]|星期|禮拜)([一二三四五六日天])/))) {
    // 以週一為一週開頭：週X = 本週那天（過了就下週）；下週X = 下個日曆週
    const curMi = (base.getDay() + 6) % 7;                 // 週一=0…週日=6
    const tgtMi = (CN_NUM[m[2]] + 6) % 7;
    let diff;
    if (m[1]) diff = (7 - curMi) + tgtMi;                  // 下週X
    else { diff = tgtMi - curMi; if (diff < 0) diff += 7; } // 週X
    res.date = offsetDate(diff);
    t = t.replace(m[0], " ");
  }
  else if ((m = t.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?號?/))) {
    const y = base.getFullYear();
    res.date = `${y}-${pad2(+m[1])}-${pad2(+m[2])}`;
    t = t.replace(m[0], " ");
  }

  res.text = t.replace(/\s+/g, " ").trim();
  if (!res.text) return null;
  return res;
}
function quickPreviewText(r) {
  const parts = [fmtMD(r.date)];
  if (r.time) parts.push(r.time);
  if (r.durationMin) parts.push(fmtDur(r.durationMin));
  if (r.repeat) parts.push({ daily: "↻ 每天", weekly: "↻ 每週", monthly: "↻ 每月" }[r.repeat]);
  parts.push(r.text);
  return "→ " + parts.join(" · ");
}

/* ============================================================
   Render：專案清單
   ============================================================ */
/* 分類改名：連動更新所有用到的專案、篩選狀態 */
function renameCategory(oldName) {
  const next = prompt(`把分類「${oldName}」改成：`, oldName)?.trim();
  if (!next || next === oldName) return;
  if (store.categories.includes(next)) { toast(`「${next}」已經存在了`); return; }
  store.categories = store.categories.map(c => c === oldName ? next : c);
  for (const p of store.projects) if (p.category === oldName) p.category = next;
  if (filterCat === oldName) filterCat = next;
  if (kanbanCat === oldName) kanbanCat = next;
  commit();
  toast(`分類「${oldName}」→「${next}」`);
}
function renderChips() {
  const cats = ["all", ...store.categories];
  $("#catChips").innerHTML = cats.map(c => {
    const label = c === "all" ? "全部" : esc(c);
    const editable = c !== "all";   // 所有分類（含預設）都可改名、刪除
    return `<button class="chip ${filterCat === c ? "active" : ""}" data-cat="${esc(c)}">${label}${editable ? `<span class="chip-e" data-editcat="${esc(c)}" title="改名">✎</span><span class="chip-x" data-delcat="${esc(c)}" title="刪除">✕</span>` : ""}</button>`;
  }).join("") + `<button class="chip add-chip" id="addCatChip">＋ 新增</button>`;

  const sts = [["all", "全部"], ["active", "進行中"], ["planning", "規劃中"], ["paused", "暫停"], ["done", "已完成"]];
  $("#statusChips").innerHTML = sts.map(([v, l]) =>
    `<button class="chip ${filterStatus === v ? "active" : ""}" data-status="${v}">${l}</button>`).join("");
}

function renderProjects() {
  const list = sortedProjects();
  const activeCnt = store.projects.filter(p => p.status !== "done").length;
  $("#projCount").textContent = `● ${activeCnt}`;
  if (!list.length) {
    $("#projectList").innerHTML = `<div class="sempty">沒有符合的專案</div>`;
    return;
  }
  const today = todayStr();
  $("#projectList").innerHTML = list.map(p => {
    const prog = progressOf(p);
    let dueHtml = "";
    if (p.deadline) {
      const diff = daysBetween(today, p.deadline);
      const cls = p.status !== "done" && diff < 0 ? "overdue" : (p.status !== "done" && diff <= 3 ? "soon" : "");
      dueHtml = `<span class="p-due ${cls}">DUE ${esc(p.deadline.slice(5).replace("-", "/"))}${cls === "overdue" ? " 逾期" : ""}</span>`;
    }
    return `<div class="pcard ${selectedProjectId === p.id ? "selected" : ""} ${p.status === "done" ? "done-card" : ""}" data-pid="${p.id}">
      <div class="p-top">
        ${p.priority ? `<span class="p-star">⭐</span>` : ""}
        <span class="p-name">${esc(p.name)}</span>
      </div>
      <div class="p-meta">
        <span class="badge st-${p.status}">${STATUS_ZH[p.status]}</span>
        <span>${esc(p.category)}</span>
        ${dueHtml}
        <span style="margin-left:auto">${prog}%</span>
      </div>
      <div class="progress"><i style="width:${prog}%"></i></div>
      <div class="p-actions">
        <button class="icon-btn" data-edit="${p.id}" title="編輯">✎</button>
        <button class="icon-btn del" data-del="${p.id}" title="刪除">✕</button>
      </div>
      <div class="p-swipe-hint">${p.status === "done" ? "↩ 恢復進行中" : "✓ 標記完成"}</div>
    </div>`;
  }).join("");
}

/* ============================================================
   Render：排程
   ============================================================ */
function scheduleSortKey(s) { return `${s.date} ${s.time || "99:99"}`; }
function renderSchedule() {
  if (!$("#scheduleGroups")) return;   // 排程清單已移除（行事曆右欄改成當天行程），保留函式防呆
  const t = todayStr();
  const real = store.schedule.filter(s => !s.repeat);
  const overdue = real.filter(s => !s.done && s.date < t).sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
  const today = real.filter(s => s.date === t).sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
  const later = real.filter(s => s.date > t).sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
  const templates = store.schedule.filter(s => s.repeat);
  const todayMin = today.reduce((sum, s) => sum + (s.durationMin || 0), 0);

  const itemHtml = (s, opts = {}) => `
    <div class="sitem ${s.done ? "done" : ""}" data-sid="${s.id}">
      ${s.repeat ? `<span class="repeat-mark">↻</span>` : `<button class="s-check" data-check="${s.id}">✓</button>`}
      <span class="s-text" data-open="${s.id}">${esc(s.text)}</span>
      ${s.ref ? `<span class="s-ref">任務</span>` : ""}
      <span class="s-meta">${opts.showDate ? fmtMD(s.date).replace(/（.*/, "") + " " : ""}${s.time ? esc(s.time) : ""}${s.durationMin ? " · " + fmtDur(s.durationMin) : ""}${s.repeat ? " · " + { daily: "每天", weekly: "每週", monthly: "每月" }[s.repeat] : ""}</span>
      ${opts.defer ? `<button class="s-defer" data-defer="${s.id}">⇥ 今天</button>` : ""}
      <button class="s-x" data-sdel="${s.id}">✕</button>
    </div>`;

  let html = "";
  if (overdue.length) {
    html += `<div class="sgroup overdue">
      <div class="sgroup-head"><span class="sgroup-title">積欠</span><span class="sgroup-sub">${overdue.length} 件</span>
      <button class="sgroup-action" id="deferAllBtn">全部順延到今天</button></div>
      ${overdue.map(s => itemHtml(s, { defer: true, showDate: true })).join("")}</div>`;
  }
  html += `<div class="sgroup">
    <div class="sgroup-head"><span class="sgroup-title">今天</span>
    <span class="sgroup-sub">${today.length} 件${todayMin ? " · 預估 " + fmtDur(todayMin) : ""}</span></div>
    ${today.length ? today.map(s => itemHtml(s)).join("") : `<div class="sempty">今天還沒排東西，上面輸入框一句話搞定</div>`}</div>`;
  if (later.length) {
    html += `<div class="sgroup">
      <div class="sgroup-head"><span class="sgroup-title">之後</span><span class="sgroup-sub">${later.length} 件</span></div>
      ${later.map(s => itemHtml(s, { showDate: true })).join("")}</div>`;
  }
  if (templates.length) {
    html += `<div class="sgroup">
      <div class="sgroup-head"><span class="sgroup-title">循環</span><span class="sgroup-sub">刪除模板 = 停止未來生成</span></div>
      ${templates.map(s => itemHtml(s)).join("")}</div>`;
  }
  $("#scheduleGroups").innerHTML = html;
}

/* ============================================================
   Render：詳情/任務
   ============================================================ */
function renderDetail() {
  // 詳情只在掃描完成後出現（analysisProjectId 有值）；直接點卡片不會帶出詳情
  const p = analysisProjectId ? project(analysisProjectId) : null;
  if (!p) {
    analysisProjectId = null;
    $("#detailBody").innerHTML = `<div class="empty-state">
      <div class="empty-icon">▦</div>
      <div class="empty-title">尚未分析專案</div>
      <div class="empty-sub">拖專案卡進中央掃描框、或雙擊卡片；<br>掃描完成後這裡會顯示專案詳情</div></div>`;
    return;
  }
  const prog = progressOf(p);
  const today = todayStr();
  const exec = executorOf(p.id);
  let dueText = "";
  if (p.deadline) {
    const diff = daysBetween(today, p.deadline);
    dueText = p.status === "done" ? `截止 ${p.deadline}` :
      diff < 0 ? `<b style="color:var(--danger)">逾期 ${-diff} 天</b>` :
      diff === 0 ? `<b style="color:var(--warn)">今天到期</b>` : `還有 ${diff} 天（${p.deadline}）`;
  }
  const tasksHtml = p.tasks.map(t => `
    <div class="task-row ${t.done ? "done" : ""}">
      <button class="s-check" data-ttoggle="${t.id}">✓</button>
      <span class="t-text">${esc(t.text)}</span>
      ${!t.done ? (taskInTodaySchedule(p.id, t.id)
        ? `<span class="t-today-btn in">✓今天</span>`
        : `<button class="t-today-btn" data-ttoday="${t.id}">⇥今天</button>`) : ""}
      <button class="s-x" data-tdel="${t.id}">✕</button>
    </div>`).join("");

  $("#detailBody").innerHTML = `
    <div class="detail-name">${p.priority ? "⭐ " : ""}${esc(p.name)}
      <button class="icon-btn" id="detailClose" title="關閉詳情" style="margin-left:auto">✕</button>
    </div>
    <div class="detail-meta">
      <span class="badge st-${p.status}">${STATUS_ZH[p.status]}</span>
      <span>${esc(p.category)}</span>
      ${dueText ? `<span>· ${dueText}</span>` : ""}
      <span>· ${prog}%</span>
      ${exec ? `<span class="exec-tag">執行中 · ${esc(exec.name)}</span>` : ""}
      <button class="icon-btn" data-edit="${p.id}" title="編輯" style="margin-left:auto">✎</button>
    </div>
    <div class="progress" style="margin:0 0 12px"><i style="width:${prog}%"></i></div>
    ${p.notes ? `<div class="detail-notes">${linkify(p.notes)}</div>` : ""}
    <div class="detail-section">任務（${p.tasks.filter(t => t.done).length}/${p.tasks.length}）</div>
    ${tasksHtml || `<div class="sempty">還沒拆任務，建議先拆 3-5 步</div>`}
    <div class="task-add-row">
      ${taskInputOpen
        ? `<input id="taskInput" type="text" placeholder="任務內容，Enter 連續新增、Esc 收起" autocomplete="off">`
        : `<button class="task-add-btn" id="taskAddBtn">＋ 新增任務</button>`}
    </div>
    ${p.status !== "done" ? `<div class="detail-actions">
      <button class="tbtn primary" id="startExecBtn" data-pid="${p.id}">${exec ? "改派執行" : "開始執行"}</button>
    </div>` : ""}`;
  if (taskInputOpen) $("#taskInput")?.focus();
}

/* ============================================================
   Render：警報條
   ============================================================ */
function alertStats() {
  const t = todayStr();
  const overdueProj = store.projects.filter(p => p.status !== "done" && p.deadline && p.deadline < t).length;
  const dueToday = store.projects.filter(p => p.status !== "done" && p.deadline === t).length;
  const overdueSched = store.schedule.filter(s => !s.repeat && !s.done && s.date < t).length;
  return { overdueProj, dueToday, overdueSched };
}
function renderAlertBar() {
  const { overdueProj, dueToday, overdueSched } = alertStats();
  const parts = [];
  if (overdueProj) parts.push(`${overdueProj} 個專案逾期`);
  if (dueToday) parts.push(`${dueToday} 個今天到期`);
  if (overdueSched) parts.push(`積欠 ${overdueSched} 件`);
  const bar = $("#alertBar");
  if (parts.length) { bar.hidden = false; bar.textContent = parts.join(" · ") + "　—　點我看簡報"; }
  else bar.hidden = true;
}

/* ============================================================
   月曆
   ============================================================ */
function renderCalendar() {
  if (!calOpen) return;
  const y = calCursor.getFullYear(), mo = calCursor.getMonth();
  $("#calTitle").textContent = `${y} 年 ${mo + 1} 月`;
  const first = new Date(y, mo, 1);
  const startOffset = (first.getDay() + 6) % 7;    // 週一起始
  const start = new Date(y, mo, 1 - startOffset);
  const t = todayStr();
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const ds = fmtDate(d);
    const inMonth = d.getMonth() === mo;
    const items = store.schedule.filter(s => !s.repeat && s.date === ds)
      .sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
    // 循環模板投影到未來
    const virtuals = ds > t ? store.schedule.filter(s => s.repeat && repeatMatches(s, ds)) : [];
    const deadlines = store.projects.filter(p => p.deadline === ds);
    const hasOverdue = ds < t && items.some(s => !s.done);
    const chips = [
      ...deadlines.map(p => ({ cls: "deadline", label: `截止 · ${p.name}` })),
      ...items.map(s => ({ cls: s.done ? "done" : "", label: `${s.time ? s.time + " " : ""}${s.text}` })),
      ...virtuals.map(s => ({ cls: "virtual", label: `${s.text}` })),
    ];
    const shown = chips.slice(0, 3);
    cells += `<div class="cal-cell ${inMonth ? "" : "other"} ${ds === t ? "today" : ""} ${calSelectedDate === ds ? "sel" : ""}" data-date="${ds}">
      <div class="cal-num">${d.getDate()}${hasOverdue ? `<span class="od-dot"></span>` : ""}</div>
      ${shown.map(c => `<div class="cal-chip ${c.cls}">${esc(c.label)}</div>`).join("")}
      ${chips.length > 3 ? `<div class="cal-more">+${chips.length - 3}</div>` : ""}
    </div>`;
  }
  $("#calGrid").innerHTML = cells;
  renderCalDayPanel();
}
function renderCalDayPanel() {
  const panel = $("#calDayPanel");
  if (!panel) return;
  const ds = calSelectedDate || todayStr(), t = todayStr();
  const items = store.schedule.filter(s => !s.repeat && s.date === ds).sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
  const virtuals = ds > t ? store.schedule.filter(s => s.repeat && repeatMatches(s, ds)) : [];
  const deadlines = store.projects.filter(p => p.deadline === ds);
  const totalMin = items.reduce((sum, s) => sum + (s.durationMin || 0), 0);
  const doneCnt = items.filter(s => s.done).length;
  const rel = ds === t ? "今天" : (daysBetween(t, ds) === 1 ? "明天" : (daysBetween(t, ds) === -1 ? "昨天" : ""));

  panel.innerHTML = `
    <div class="cal-day-head">
      <div class="cal-day-title">${fmtMD(ds)}${rel ? `<span class="cal-day-rel">${rel}</span>` : ""}</div>
      <button class="tbtn" data-caladd="${ds}">＋ 排程</button>
    </div>
    <div class="cal-day-sub">${items.length ? `${items.length} 件${doneCnt ? `・完成 ${doneCnt}` : ""}${totalMin ? `・預估 ${fmtDur(totalMin)}` : ""}` : "這天沒有排程"}</div>
    ${deadlines.length ? `<div class="cal-day-section">專案截止</div>` : ""}
    ${deadlines.map(p => `<div class="sitem" style="background:var(--danger-bg)">
      <span class="s-text" data-editproj="${p.id}">${esc(p.name)} — 截止日</span>
      <span class="badge st-${p.status}">${STATUS_ZH[p.status]}</span></div>`).join("")}
    ${items.length ? `<div class="cal-day-section">當天行程</div>` : ""}
    ${items.map(s => `<div class="sitem ${s.done ? "done" : ""}">
      <button class="s-check" data-check="${s.id}">✓</button>
      <span class="s-text" data-open="${s.id}">${esc(s.text)}</span>
      ${s.ref ? `<span class="s-ref">任務</span>` : ""}
      <span class="s-meta">${s.time || "未定時"}${s.durationMin ? " · " + fmtDur(s.durationMin) : ""}</span>
      <button class="s-x" data-sdel="${s.id}">✕</button></div>`).join("")}
    ${virtuals.length ? `<div class="cal-day-section">循環（投影）</div>` : ""}
    ${virtuals.map(s => `<div class="sitem">
      <span class="repeat-mark">↻</span>
      <span class="s-text" data-open="${s.id}">${esc(s.text)}</span>
      <span class="s-meta">${s.time || ""}・點擊編輯模板</span></div>`).join("")}
    ${!items.length && !virtuals.length && !deadlines.length ? `<div class="sempty">這天沒有安排，按上方「＋ 排程」新增</div>` : ""}`;
}
function setRailActive(id) {
  // 團隊/日誌抽屜是疊加面板、不是換頁 → 不參與換頁高亮的互斥
  $$(".rail-btn:not(#railTeam):not(#railLog)").forEach(b => b.classList.remove("active"));
  $("#" + id)?.classList.add("active");
}
/* 三頁互斥切換：工作台 / 行事曆 / 看板 */
function showPage(page) {
  currentPage = page;
  $("#columns").hidden = page !== "board";
  $("#calendarWrap").hidden = page !== "calendar";
  $("#kanbanWrap").hidden = page !== "kanban";
  calOpen = page === "calendar";              // 沿用既有 calOpen 給 renderCalendar 判斷
  setRailActive({ board: "railBoard", calendar: "railCalendar", kanban: "railKanban" }[page]);
  if (page === "calendar") {
    calCursor = new Date(workNow().getFullYear(), workNow().getMonth(), 1);
    calSelectedDate = calSelectedDate || todayStr();
    renderCalendar();
  }
  if (page === "kanban") renderKanban();
}
function openCalendar() { showPage("calendar"); }
function closeCalendar() { showPage("board"); }

/* ============================================================
   專案看板（Kanban）
   ============================================================ */
const KB_COLS = [["planning", "規劃中"], ["active", "進行中"], ["paused", "暫停"], ["done", "已完成"]];
function renderKbCat() {
  const sel = $("#kbCat");
  if (!sel) return;
  const opts = `<option value="all">全部分類</option>` + store.categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  if (sel.innerHTML !== opts) sel.innerHTML = opts;
  if (kanbanCat !== "all" && !store.categories.includes(kanbanCat)) kanbanCat = "all";   // 分類被刪 → 退回全部
  sel.value = kanbanCat;
}
function renderKanban() {
  if (currentPage !== "kanban") return;
  renderKbCat();
  const t = todayStr();
  $("#kanbanBoard").innerHTML = KB_COLS.map(([st, label]) => {
    const cards = store.projects.filter(p => p.status === st && (kanbanCat === "all" || p.category === kanbanCat))
      .sort((a, b) => (b.priority - a.priority) || ((a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1));
    return `<div class="kb-col ${st === "done" ? "done-col" : ""}" data-kbcol="${st}">
      <div class="kb-col-head"><span class="kb-dot ${st}"></span>${label}<span class="kb-count">${cards.length}</span></div>
      ${cards.map(p => {
        const prog = progressOf(p);
        const exec = executorOf(p.id);
        const overdue = st !== "done" && p.deadline && p.deadline < t;
        return `<div class="kb-card" data-kbcard="${p.id}">
          <div class="kb-name">${p.priority ? "⭐" : ""}<span>${esc(p.name)}</span></div>
          <div class="kb-meta">
            <span>${esc(p.category)}</span>
            ${p.deadline ? `<span class="p-due ${overdue ? "overdue" : ""}">DUE ${esc(p.deadline.slice(5).replace("-", "/"))}</span>` : ""}
            ${exec ? `<span class="kb-exec"><span class="member-avatar">${esc(exec.name.slice(0, 1))}</span>${esc(exec.name)}</span>` : ""}
            <span style="margin-left:auto">${prog}%</span>
          </div>
          <div class="progress"><i style="width:${prog}%"></i></div>
          <div class="p-actions">
            <button class="icon-btn" data-edit="${p.id}">✎</button>
            <button class="icon-btn del" data-del="${p.id}">✕</button>
          </div>
        </div>`;
      }).join("")}
      <button class="kb-add" data-kbadd="${st}">＋ 新增專案</button>
    </div>`;
  }).join("");
}
/* 換狀態（拖放共用核心）；完成/恢復才記日誌，維持關鍵動作版一致 */
function setProjectStatus(pid, status) {
  const p = project(pid);
  if (!p || p.status === status) return;
  const wasDone = p.status === "done";
  p.status = status;
  if (status === "done" && !wasDone) { p.doneAt = todayStr(); logAction("done", `完成專案「${p.name}」`); }
  if (status !== "done") { p.doneAt = null; if (wasDone) logAction("undone", `把「${p.name}」恢復為${{ planning: "規劃中", active: "進行中", paused: "暫停" }[status]}`); }
  commit();
  toast(`「${p.name}」→ ${STATUS_ZH[status]}`);
}
/* 拖曳（pointer events，沿用專案卡手感） */
const kbDrag = { pid: null, startX: 0, startY: 0, active: false, ghost: null, srcEl: null };
function kbColUnder(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  return el ? el.closest(".kb-col") : null;
}
function onKbMove(e) {
  if (!kbDrag.active && Math.hypot(e.clientX - kbDrag.startX, e.clientY - kbDrag.startY) > 8) {
    kbDrag.active = true;
    document.body.classList.add("dragging");
    kbDrag.srcEl.classList.add("dragging-src");
    const g = document.createElement("div");
    g.className = "ghost-card";
    g.textContent = project(kbDrag.pid)?.name || "";
    $("#ghostLayer").appendChild(g);
    kbDrag.ghost = g;
  }
  if (!kbDrag.active) return;
  kbDrag.ghost.style.left = (e.clientX + 12) + "px";
  kbDrag.ghost.style.top = (e.clientY - 14) + "px";
  $$(".kb-col").forEach(c => c.classList.toggle("drop-hot", c === kbColUnder(e)));
}
function onKbUp(e) {
  window.removeEventListener("pointermove", onKbMove);
  window.removeEventListener("pointerup", onKbUp);
  const col = kbDrag.active ? kbColUnder(e) : null;
  document.body.classList.remove("dragging");
  $$(".kb-col").forEach(c => c.classList.remove("drop-hot"));
  kbDrag.ghost?.remove(); kbDrag.ghost = null;
  kbDrag.srcEl?.classList.remove("dragging-src");
  if (col) setProjectStatus(kbDrag.pid, col.dataset.kbcol);   // commit → renderAll → 看板重畫
  kbDrag.pid = null; kbDrag.active = false; kbDrag.srcEl = null;
}
function bindKanbanDrag() {
  $("#kanbanBoard").addEventListener("pointerdown", e => {
    const card = e.target.closest(".kb-card");
    if (!card || e.target.closest("button")) return;
    kbDrag.pid = card.dataset.kbcard; kbDrag.srcEl = card;
    kbDrag.startX = e.clientX; kbDrag.startY = e.clientY; kbDrag.active = false;
    window.addEventListener("pointermove", onKbMove);
    window.addEventListener("pointerup", onKbUp);
  });
}

/* ============================================================
   每日簡報
   ============================================================ */
function openBrief() {
  const t = todayStr();
  const midnight = isMidnight();
  $("#briefTitle").innerHTML = `每日簡報 · ${fmtMD(t)}${midnight ? `<span class="midnight-tag">凌晨模式（仍算 ${t.slice(5)}）</span>` : ""}`;
  const todayItems = store.schedule.filter(s => !s.repeat && s.date === t).sort((a, b) => scheduleSortKey(a) < scheduleSortKey(b) ? -1 : 1);
  const totalMin = todayItems.reduce((s, i) => s + (i.durationMin || 0), 0);
  const overdue = store.schedule.filter(s => !s.repeat && !s.done && s.date < t);
  const projLate = store.projects.filter(p => p.status !== "done" && p.deadline && p.deadline < t);
  const projToday = store.projects.filter(p => p.status !== "done" && p.deadline === t);
  const projSoon = store.projects.filter(p => p.status !== "done" && p.deadline && p.deadline > t && daysBetween(t, p.deadline) <= 3);
  const activeProj = store.projects.filter(p => p.status === "active").length;
  const openTasks = store.projects.reduce((n, p) => n + (p.status === "done" ? 0 : p.tasks.filter(x => !x.done).length), 0);

  let html = `<div class="brief-sec"><h3>今日排程（${todayItems.length} 件${totalMin ? " · 預估 " + fmtDur(totalMin) : ""}）</h3>
    <div class="brief-list">${todayItems.length ? todayItems.map(s =>
      `<div class="brief-item"><span class="bi-time">${s.time || "－"}</span><span>${esc(s.text)}</span><span style="margin-left:auto;color:var(--gray);font-size:11px">${s.durationMin ? fmtDur(s.durationMin) : ""}</span></div>`).join("")
      : `<div class="sempty">今天還沒排，開工前先排一下</div>`}</div>
    ${totalMin > 360 ? `<div class="overload-warn">今天排了 ${fmtDur(totalMin)}，超過 6 小時——排太滿，砍一點吧</div>` : ""}</div>`;

  if (overdue.length) {
    html += `<div class="brief-sec"><h3>積欠事項（${overdue.length} 件）</h3>
      <div class="brief-list">${overdue.map(s => `<div class="brief-item warn">${fmtMD(s.date)} · ${esc(s.text)}</div>`).join("")}</div>
      <button class="tbtn" id="briefDeferAll" style="margin-top:8px">全部順延到今天</button></div>`;
  }
  if (projLate.length || projToday.length || projSoon.length) {
    html += `<div class="brief-sec"><h3>專案截止警報</h3><div class="brief-list">
      ${projLate.map(p => `<div class="brief-item alert">已逾期 ${-daysBetween(t, p.deadline)} 天 · ${esc(p.name)}</div>`).join("")}
      ${projToday.map(p => `<div class="brief-item alert">今天到期 · ${esc(p.name)}</div>`).join("")}
      ${projSoon.map(p => `<div class="brief-item warn">${daysBetween(t, p.deadline)} 天後到期 · ${esc(p.name)}</div>`).join("")}
    </div></div>`;
  }
  html += `<div class="brief-sec"><h3>戰情概況</h3><div class="brief-stats">
    <div class="stat-tile"><div class="n">${activeProj}</div><div class="l">進行中專案</div></div>
    <div class="stat-tile"><div class="n">${openTasks}</div><div class="l">未完成任務</div></div>
  </div></div>`;
  $("#briefBody").innerHTML = html;
  $("#briefModal").hidden = false;
}

/* ============================================================
   週回顧
   ============================================================ */
function weekRange() {
  const now = workNow();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return [fmtDate(monday), fmtDate(sunday)];
}
function openWeekly() {
  const [ws, we] = weekRange();
  const inWeek = d => d && d >= ws && d <= we;
  const doneSched = store.schedule.filter(s => !s.repeat && s.done && inWeek(s.doneAt));
  const doneTasks = [];
  for (const p of store.projects) for (const t of p.tasks) if (t.done && inWeek(t.doneAt)) doneTasks.push({ ...t, proj: p.name });
  const doneProjects = store.projects.filter(p => p.status === "done" && inWeek(p.doneAt));
  const totalMin = doneSched.reduce((s, i) => s + (i.durationMin || 0), 0);
  const activeList = store.projects.filter(p => p.status === "active");
  const mdShort = s => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;

  const allDone = [
    ...doneProjects.map(p => `專案完結：${p.name}`),
    ...doneTasks.map(t => `${t.text}（${t.proj}）`),
    ...doneSched.filter(s => !s.ref).map(s => s.text),
  ];

  let body;
  if (!allDone.length) {
    body = `<div class="empty-state"><div class="empty-icon">▦</div>
      <div class="empty-title">這週還沒有完成紀錄</div>
      <div class="empty-sub">沒關係，每個大爆發前面都有安靜的一週。<br>從今天排一件小事開始就好。</div></div>`;
  } else {
    const draft = [
      `本週戰報（${mdShort(ws)}–${mdShort(we)}）`,
      ``,
      `完成 ${allDone.length} 件：`,
      ...allDone.slice(0, 8).map(x => `・${x}`),
      allDone.length > 8 ? `・…等共 ${allDone.length} 件` : null,
      ``,
      totalMin ? `投入 ${(totalMin / 60).toFixed(1)} 小時` : null,
      activeList.length ? `` : null,
      activeList.length ? `進行中：` : null,
      ...activeList.map(p => `・${p.name}（${progressOf(p)}%）`),
    ].filter(x => x !== null).join("\n");

    body = `<div class="brief-sec"><h3>本週完成（${allDone.length} 件${totalMin ? " · 投入 " + (totalMin / 60).toFixed(1) + " 小時" : ""}）</h3>
      <div class="brief-list">${allDone.map(x => `<div class="brief-item">${esc(x)}</div>`).join("")}</div></div>
      <div class="brief-sec"><h3>Threads 發文草稿</h3>
      <textarea id="threadsDraft" rows="10">${esc(draft)}</textarea>
      <button class="tbtn primary" id="copyDraft" style="margin-top:8px">一鍵複製</button></div>`;
  }
  $("#weeklyBody").innerHTML = body;
  $("#weeklyModal").hidden = false;
}

/* ============================================================
   分析模式（掃描機）
   ============================================================ */
const SCAN_HINT = "拖曳專案卡到這裡<br>或雙擊卡片，啟動分析";
/* 拖進掃描框 / 雙擊 → 光束加速掃 ~0.9 秒 → 右欄顯示該專案詳情 */
function openAnalysis(pid) {
  const p = project(pid); if (!p) return;
  const frame = $("#scanFrame");
  const hint = $("#scanHint");
  if (frame) {
    frame.classList.add("scanning");
    if (hint) hint.innerHTML = "掃描中…";
  }
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    if (frame) frame.classList.remove("scanning");
    if (hint) hint.innerHTML = SCAN_HINT;
    if (!project(pid)) return;           // 掃描期間專案被刪 → 放棄
    analysisProjectId = pid;
    selectedProjectId = pid;             // 左欄卡片同步高亮
    taskInputOpen = false;
    renderProjects();
    renderDetail();
  }, 900);
}
function exitAnalysis() {
  analysisProjectId = null;
  renderDetail();
}

/* ============================================================
   團隊成員面板
   ============================================================ */
function renderPresence() {
  const bar = $("#onlineBar");
  if (!bar) return;
  if (!cloud.enabled() || !cloud.user) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="ob-count">${onlineCount} 人在線</span>` +
    onlineList.map(n => `<span class="online-chip">${esc(n)}</span>`).join("");
}
function renderMembers() {
  if (!teamOpen) return;
  renderPresence();
  const list = $("#memberList");
  if (!store.members.length) {
    list.innerHTML = `<div class="sempty">還沒有成員，上面輸入名字 Enter 新增</div>`;
    return;
  }
  list.innerHTML = store.members.map(m => {
    const p = m.currentProjectId ? project(m.currentProjectId) : null;
    const online = onlineLower.has(m.name.toLowerCase());
    return `<div class="member-card ${online ? "online" : ""}">
      <span class="member-dot ${p ? "" : "idle"}"></span>
      <div class="member-avatar">${esc(m.name.slice(0, 1))}</div>
      <div class="member-info">
        <div class="member-name">${esc(m.name)}</div>
        ${p ? `<div class="member-proj">執行中：<b>${esc(p.name)}</b>（${progressOf(p)}%）</div>`
            : `<div class="member-idle">待命中</div>`}
      </div>
      <button class="s-x" data-mdel="${m.id}">✕</button>
    </div>`;
  }).join("");
}
function toggleTeam(open = !teamOpen) {
  teamOpen = open;
  $("#teamDrawer").hidden = !teamOpen;
  $("#railTeam").classList.toggle("active", teamOpen);
  if (teamOpen) { toggleLog(false); renderMembers(); $("#memberInput").focus(); }   // 跟日誌抽屜互斥
}
function addMember(name) {
  name = name.trim();
  if (!name) return null;
  if (store.members.some(m => m.name === name)) { toast(`「${name}」已經在名單上了`); return null; }
  const m = { id: uid(), name, currentProjectId: null, startedAt: null };
  store.members.push(m);
  logAction("create", `新增成員「${name}」`);
  commit();
  return m;
}
function deleteMember(id) {
  const idx = store.members.findIndex(m => m.id === id);
  if (idx < 0) return;
  const [removed] = store.members.splice(idx, 1);
  logAction("delete", `移除成員「${removed.name}」`);
  commit();
  toast(`已移除成員「${removed.name}」`, () => { store.members.splice(idx, 0, removed); logAction("restore", `復原成員「${removed.name}」`); commit(); });
}

/* ============================================================
   開始執行 → 指派成員
   ============================================================ */
function openMemberPick(pid) {
  pickingProjectId = pid;
  const body = $("#memberPickList");
  if (!store.members.length) {
    body.innerHTML = `<div class="sempty">還沒有成員——先在左側成員面板新增，或直接在下面輸入</div>
      <input id="mpQuickAdd" type="text" placeholder="輸入名字，Enter 新增並指派" autocomplete="off">`;
  } else {
    body.innerHTML = store.members.map(m => {
      const cur = m.currentProjectId ? project(m.currentProjectId) : null;
      return `<button class="mp-item" data-mpick="${m.id}">
        <div class="member-avatar">${esc(m.name.slice(0, 1))}</div>
        <div class="member-info">
          <div class="member-name">${esc(m.name)}</div>
          ${cur ? `<div class="member-proj">目前：${esc(cur.name)}（會被覆蓋）</div>`
                : `<div class="member-idle">待命中</div>`}
        </div>
      </button>`;
    }).join("");
  }
  $("#memberPickModal").hidden = false;
  $("#mpQuickAdd")?.focus();
}
function assignProject(memberId, pid) {
  const m = store.members.find(x => x.id === memberId); const p = project(pid);
  if (!m || !p) return;
  // 一專案一執行者：先把其他掛同一案的成員清掉
  for (const other of store.members) if (other.id !== memberId && other.currentProjectId === pid) { other.currentProjectId = null; other.startedAt = null; }
  m.currentProjectId = pid;              // 一人一專案：直接覆蓋原本的
  m.startedAt = todayStr();
  if (p.status === "planning" || p.status === "paused") p.status = "active";  // 開始執行 = 進行中
  $("#memberPickModal").hidden = true;
  logAction("assign", `指派「${p.name}」給 ${m.name}`);
  if (!teamOpen) toggleTeam(true);       // 打開成員面板讓使用者看到同步結果
  commit();
  toast(`已指派「${p.name}」給 ${m.name}`);
}

/* ============================================================
   工作日誌面板
   ============================================================ */
function renderLog() {
  if (!logOpen) return;
  const list = $("#logList");
  const items = [...store.activity].sort((a, b) => a.ts > b.ts ? -1 : 1);   // 新的在上
  if (!items.length) { list.innerHTML = `<div class="sempty">還沒有紀錄——完成、刪除、指派都會自動記在這</div>`; return; }
  const today = new Date().toDateString(), yest = new Date(Date.now() - 86400000).toDateString();
  let lastDate = "", html = "";
  for (const e of items) {
    const d = new Date(e.ts);
    const dKey = d.toDateString();
    if (dKey !== lastDate) {
      lastDate = dKey;
      const label = dKey === today ? "今天" : dKey === yest ? "昨天" : `${d.getMonth() + 1}/${d.getDate()}（週${WEEK_ZH[d.getDay()]}）`;
      html += `<div class="log-date">${label}</div>`;
    }
    html += `<div class="log-row">
      <span class="log-time">${pad2(d.getHours())}:${pad2(d.getMinutes())}</span>
      <span class="log-dot ${esc(e.kind)}"></span>
      <span class="log-body"><span class="log-actor">${esc(e.actor)}</span>${esc(e.text)}</span>
    </div>`;
  }
  list.innerHTML = html;
}
function toggleLog(open = !logOpen) {
  logOpen = open;
  $("#logDrawer").hidden = !logOpen;
  $("#railLog").classList.toggle("active", logOpen);
  if (logOpen) { toggleTeam(false); renderLog(); }   // 跟成員抽屜互斥
}

/* ============================================================
   拖曳／滑動／點選（pointer events）
   ============================================================ */
const drag = { pid: null, startX: 0, startY: 0, active: false, ghost: null, cardEl: null, lastTap: 0, lastTapPid: null };

function onCardPointerDown(e, card) {
  if (e.target.closest("button")) return;
  drag.pid = card.dataset.pid;
  drag.cardEl = card;
  drag.startX = e.clientX; drag.startY = e.clientY;
  drag.active = false;
  window.addEventListener("pointermove", onCardPointerMove);
  window.addEventListener("pointerup", onCardPointerUp);
}
function centerHot(e) {
  const r = $("#colCenter").getBoundingClientRect();
  return e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
}
function onCardPointerMove(e) {
  const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
  if (!drag.active && Math.hypot(dx, dy) > 10) {
    drag.active = true;
    document.body.classList.add("dragging");
    $("#colCenter").classList.add("drop-armed");
    const g = document.createElement("div");
    g.className = "ghost-card";
    g.textContent = project(drag.pid)?.name || "";
    $("#ghostLayer").appendChild(g);
    drag.ghost = g;
  }
  if (!drag.active) return;
  drag.ghost.style.left = (e.clientX + 12) + "px";
  drag.ghost.style.top = (e.clientY - 14) + "px";
  $("#colCenter").classList.toggle("drop-hot", centerHot(e));
  // 左滑視覺提示
  const hint = drag.cardEl.querySelector(".p-swipe-hint");
  if (hint) hint.style.opacity = (!centerHot(e) && dx < -40) ? Math.min(1, (-dx - 40) / 60) : 0;
  drag.cardEl.style.transform = !centerHot(e) && dx < 0 ? `translateX(${Math.max(dx, -120)}px)` : "";
}
function onCardPointerUp(e) {
  window.removeEventListener("pointermove", onCardPointerMove);
  window.removeEventListener("pointerup", onCardPointerUp);
  const dx = e.clientX - drag.startX;
  const pid = drag.pid;
  if (drag.active) {
    const overCenter = centerHot(e);
    document.body.classList.remove("dragging");
    $("#colCenter").classList.remove("drop-armed", "drop-hot");
    drag.ghost?.remove(); drag.ghost = null;
    if (drag.cardEl) { drag.cardEl.style.transform = ""; const h = drag.cardEl.querySelector(".p-swipe-hint"); if (h) h.style.opacity = 0; }
    if (overCenter) openAnalysis(pid);
    else if (dx < -80) toggleProjectDone(pid);
  } else {
    // 點選 / 雙擊
    const now = Date.now();
    if (drag.lastTapPid === pid && now - drag.lastTap < 350) {
      openAnalysis(pid);
      drag.lastTap = 0; drag.lastTapPid = null;
    } else {
      // 單擊 = 只做選取高亮，右欄詳情要靠掃描才會出現（不動 analysisProjectId / 右欄）
      drag.lastTap = now; drag.lastTapPid = pid;
      selectedProjectId = selectedProjectId === pid ? null : pid;
      renderProjects();
    }
  }
  drag.pid = null; drag.active = false; drag.cardEl = null;
}

/* ============================================================
   renderAll + 事件繫結
   ============================================================ */
function renderAll() {
  renderChips();
  renderProjects();
  renderDetail();
  renderAlertBar();
  renderCalendar();
  renderKanban();
  renderMembers();
  renderLog();
  $("#dateBtn").textContent = `${fmtMD(todayStr())}${isMidnight() ? "・凌晨" : ""}`;
}

function bindEvents() {
  /* 頂部 / 換頁 */
  $("#railBoard").onclick = () => showPage("board");
  $("#boardBtnMobile").onclick = () => showPage("board");
  $("#railKanban").onclick = () => showPage("kanban");
  $("#kanbanBtnMobile").onclick = () => showPage("kanban");
  $("#kbCat").onchange = e => { kanbanCat = e.target.value; renderKanban(); };
  $("#dateBtn").onclick = () => calOpen ? showPage("board") : showPage("calendar");
  $("#railCalendar").onclick = () => calOpen ? showPage("board") : showPage("calendar");
  bindKanbanDrag();
  $("#briefBtn").onclick = openBrief;
  $("#railBrief").onclick = openBrief;
  $("#weeklyBtn").onclick = openWeekly;
  $("#railWeekly").onclick = openWeekly;
  $("#alertBar").onclick = openBrief;

  /* 團隊成員 */
  $("#railTeam").onclick = () => toggleTeam();
  $("#teamBtnMobile").onclick = () => toggleTeam();
  $("#teamClose").onclick = () => toggleTeam(false);
  $("#memberInput").addEventListener("keydown", e => {
    if (e.key === "Enter") { if (addMember(e.target.value)) e.target.value = ""; }
    else if (e.key === "Escape") { toggleTeam(false); e.stopPropagation(); }
  });
  $("#mpCancel").onclick = () => $("#memberPickModal").hidden = true;

  /* 工作日誌 */
  $("#railLog").onclick = () => toggleLog();
  $("#logBtnMobile").onclick = () => toggleLog();
  $("#logClose").onclick = () => toggleLog(false);

  /* 點面板以外的空白處 → 收回抽屜（排除開關鈕與彈窗） */
  document.addEventListener("click", e => {
    if (teamOpen && !e.target.closest("#teamDrawer, #railTeam, #teamBtnMobile, .modal-backdrop")) toggleTeam(false);
    if (logOpen && !e.target.closest("#logDrawer, #railLog, #logBtnMobile, .modal-backdrop")) toggleLog(false);
  });

  /* 登入 / 登出 */
  $("#authLoginBtn").onclick = async () => {
    const err = $("#authError"); err.hidden = true;
    const btn = $("#authLoginBtn"); btn.disabled = true;
    try { await cloud.login($("#authEmail").value.trim(), $("#authPassword").value); }
    catch (e) { err.hidden = false; err.textContent = "登入失敗：帳號或密碼不對（帳號要由管理員邀請）"; btn.disabled = false; }
  };
  $("#authPassword").addEventListener("keydown", e => { if (e.key === "Enter") $("#authLoginBtn").click(); });
  $("#railLogout").onclick = () => cloud.logout();

  /* 專案 modal */
  $("#addProjectBtn").onclick = () => openProjectModal();
  $("#pmCancel").onclick = () => $("#projectModal").hidden = true;
  $("#pmSave").onclick = saveProjectModal;

  /* 排程 modal */
  $("#smCancel").onclick = () => $("#scheduleModal").hidden = true;
  $("#smSave").onclick = saveScheduleModal;

  /* 簡報 / 週報 */
  $("#briefClose").onclick = () => $("#briefModal").hidden = true;
  $("#weeklyClose").onclick = () => $("#weeklyModal").hidden = true;

  /* 月曆 */
  $("#calPrev").onclick = () => { calCursor.setMonth(calCursor.getMonth() - 1); renderCalendar(); };
  $("#calNext").onclick = () => { calCursor.setMonth(calCursor.getMonth() + 1); renderCalendar(); };
  $("#calToday").onclick = () => { calCursor = new Date(workNow().getFullYear(), workNow().getMonth(), 1); calSelectedDate = todayStr(); renderCalendar(); };
  $("#calClose").onclick = closeCalendar;

  /* ESC 關閉所有 modal；若右欄在顯示詳情則收回空狀態 */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      for (const id of ["projectModal", "scheduleModal", "briefModal", "weeklyModal", "memberPickModal"]) $("#" + id).hidden = true;
      if (analysisProjectId) exitAnalysis();
    }
  });
  /* 點 backdrop 關閉 */
  $$(".modal-backdrop").forEach(bd => bd.addEventListener("pointerdown", e => { if (e.target === bd) bd.hidden = true; }));

  /* ---- 事件委派 ---- */
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-cat],[data-delcat],[data-editcat],[data-status],#addCatChip,[data-edit],[data-del],[data-check],[data-open],[data-sdel],[data-defer],#deferAllBtn,#briefDeferAll,[data-ttoggle],[data-tdel],[data-ttoday],#taskAddBtn,[data-caladd],[data-editproj],#copyDraft,#detailClose,#startExecBtn,[data-mdel],[data-mpick],[data-kbadd]");
    if (!el) return;

    if (el.id === "detailClose") { exitAnalysis(); return; }
    if (el.id === "startExecBtn") { openMemberPick(el.dataset.pid); return; }
    if (el.dataset.mdel) { deleteMember(el.dataset.mdel); return; }
    if (el.dataset.mpick) { assignProject(el.dataset.mpick, pickingProjectId); return; }
    if (el.dataset.kbadd) { openProjectModal(null, "", el.dataset.kbadd); return; }

    if (el.dataset.editcat) {
      e.stopPropagation();
      renameCategory(el.dataset.editcat); return;
    }
    if (el.dataset.delcat !== undefined && el.dataset.delcat) {
      e.stopPropagation();
      const c = el.dataset.delcat;
      const inUse = store.projects.filter(p => p.category === c).length;
      if (inUse) { toast(`還有 ${inUse} 個專案在用「${c}」，先改分類或刪掉那些專案再刪分類`); return; }
      store.categories = store.categories.filter(x => x !== c);
      if (filterCat === c) filterCat = "all";
      commit(); return;
    }
    if (el.dataset.cat) { filterCat = el.dataset.cat; renderChips(); renderProjects(); return; }
    if (el.dataset.status) { filterStatus = el.dataset.status; renderChips(); renderProjects(); return; }
    if (el.id === "addCatChip") {
      const name = prompt("新分類名稱：")?.trim();
      if (!name) return;
      if (store.categories.includes(name)) { toast("這個分類已經存在"); return; }
      store.categories.push(name); commit(); return;
    }
    if (el.dataset.edit) { openProjectModal(el.dataset.edit); return; }
    if (el.dataset.del) { deleteProject(el.dataset.del); return; }
    if (el.dataset.editproj) { openProjectModal(el.dataset.editproj); return; }
    if (el.dataset.check) { toggleScheduleDone(el.dataset.check); return; }
    if (el.dataset.open) { openScheduleModal(el.dataset.open); return; }
    if (el.dataset.sdel) { deleteScheduleItem(el.dataset.sdel); return; }
    if (el.dataset.defer) { deferToToday(el.dataset.defer); return; }
    if (el.id === "deferAllBtn") { deferAllOverdue(); return; }
    if (el.id === "briefDeferAll") { deferAllOverdue(); openBrief(); return; }
    if (el.dataset.ttoggle) { toggleTask(selectedProjectId, el.dataset.ttoggle); return; }
    if (el.dataset.tdel) { deleteTask(selectedProjectId, el.dataset.tdel); return; }
    if (el.dataset.ttoday) { pushTaskToToday(selectedProjectId, el.dataset.ttoday); return; }
    if (el.id === "taskAddBtn") { taskInputOpen = true; renderDetail(); return; }
    if (el.dataset.caladd) { openScheduleModal(null, el.dataset.caladd); return; }
    if (el.id === "copyDraft") {
      navigator.clipboard.writeText($("#threadsDraft").value).then(() => toast("已複製，直接貼到 Threads"));
      return;
    }
  });

  /* 任務行內輸入（Enter 連續、Esc 收起）；詳情由 analysisProjectId 驅動 */
  document.addEventListener("keydown", e => {
    if (e.target.id === "taskInput") {
      if (e.key === "Enter") {
        const text = e.target.value.trim();
        if (!text) return;
        project(analysisProjectId)?.tasks.push({ id: uid(), text, done: false, doneAt: null });
        commit();   // renderDetail 會保留輸入框 focus
      } else if (e.key === "Escape") {
        taskInputOpen = false; renderDetail();
        e.stopPropagation();
      }
      return;
    }
    /* 成員選單快速新增並指派 */
    if (e.target.id === "mpQuickAdd" && e.key === "Enter") {
      const m = addMember(e.target.value);
      if (m) assignProject(m.id, pickingProjectId);
    }
  }, true);

  /* 專案卡拖曳（委派 pointerdown） */
  $("#projectList").addEventListener("pointerdown", e => {
    const card = e.target.closest(".pcard");
    if (card) onCardPointerDown(e, card);
  });

  /* 月曆格子點選 */
  $("#calGrid").addEventListener("click", e => {
    const cell = e.target.closest(".cal-cell");
    if (!cell) return;
    calSelectedDate = cell.dataset.date;
    renderCalendar();
  });
}

/* ============================================================
   Supabase 雲端同步（未設定時全部 no-op，退回單人模式）
   ============================================================ */
const cloud = {
  client: null, user: null, syncing: false,
  lastSynced: { projects: {}, schedule: {}, members: {}, activity: {} },  // id → JSON string 快照，用來 diff

  enabled() { return !!(window.CC_SUPABASE_URL && window.CC_SUPABASE_ANON_KEY && window.supabase); },

  init() {
    if (!this.enabled()) return;
    this.client = window.supabase.createClient(window.CC_SUPABASE_URL, window.CC_SUPABASE_ANON_KEY);
  },

  /* --- 登入流程 --- */
  async requireAuth() {                       // 回傳 true = 已登入可進 app
    if (!this.enabled()) return true;         // 單人模式直接放行
    const { data: { session } } = await this.client.auth.getSession();
    if (session) { this.user = session.user; return true; }
    $("#authGate").hidden = false;
    return false;
  },
  async login(email, password) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    location.reload();                        // 重載走完整啟動流程，最單純
  },
  async logout() { await this.client.auth.signOut(); location.reload(); },

  /* --- 開站全量拉取 --- */
  async pullAll() {
    if (!this.user) return;
    const [pj, sc, mb, ac, mt] = await Promise.all([
      this.client.from("projects").select("id,data"),
      this.client.from("schedule").select("id,data"),
      this.client.from("members").select("id,data"),
      this.client.from("activity").select("id,data"),
      this.client.from("meta").select("key,data"),
    ]);
    const remoteEmpty = !pj.data?.length && !sc.data?.length && !mb.data?.length;   // 不把 activity 算進遷移判斷
    if (remoteEmpty && (store.projects.length || store.schedule.length)) {
      await this.pushFull();                  // 雲端空、本機有料（第一次遷移）→ 推上去
      return;
    }
    store.projects = (pj.data || []).map(r => r.data);
    store.schedule = (sc.data || []).map(r => r.data);
    store.members  = (mb.data || []).map(r => r.data);
    store.activity = (ac.data || []).map(r => r.data);
    const cats = (mt.data || []).find(r => r.key === "categories");
    if (cats) store.categories = cats.data;
    store.persist(false);                     // 寫回 localStorage 當快取
    this.snapshot();
  },

  /* --- 寫入：diff 後逐筆 upsert / delete --- */
  snapshot() {
    for (const [table, list] of [["projects", store.projects], ["schedule", store.schedule], ["members", store.members], ["activity", store.activity]]) {
      this.lastSynced[table] = Object.fromEntries(list.map(x => [x.id, JSON.stringify(x)]));
    }
  },
  async pushFull() {
    for (const [table, list] of [["projects", store.projects], ["schedule", store.schedule], ["members", store.members], ["activity", store.activity]]) {
      if (list.length) await this.client.from(table).upsert(list.map(x => ({ id: x.id, data: x })));
    }
    await this.client.from("meta").upsert({ key: "categories", data: store.categories });
    this.snapshot();
  },
  _pushTimer: null,
  push() {
    if (!this.user) return;
    clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => this._pushDiff(), 800);
  },
  async _pushDiff() {
    if (this.syncing) return;                 // realtime 套用中，不回推
    try {
      for (const [table, list] of [["projects", store.projects], ["schedule", store.schedule], ["members", store.members], ["activity", store.activity]]) {
        const prev = this.lastSynced[table];
        const nowIds = new Set(list.map(x => x.id));
        const changed = list.filter(x => prev[x.id] !== JSON.stringify(x));
        const removed = Object.keys(prev).filter(id => !nowIds.has(id));
        if (changed.length) await this.client.from(table).upsert(changed.map(x => ({ id: x.id, data: x })));
        if (removed.length) await this.client.from(table).delete().in("id", removed);
      }
      await this.client.from("meta").upsert({ key: "categories", data: store.categories });
      this.snapshot();
    } catch (e) { console.warn("cloud push fail", e); }
  },

  /* --- Realtime：別人改了 → 套進 store → 重畫 --- */
  subscribe() {
    if (!this.user) return;
    const apply = (table, listKey) => payload => {
      this.syncing = true;
      const list = store[listKey];
      if (payload.eventType === "DELETE") {
        const i = list.findIndex(x => x.id === payload.old.id);
        if (i >= 0) list.splice(i, 1);
        delete this.lastSynced[table][payload.old.id];
      } else {
        const row = payload.new;
        const i = list.findIndex(x => x.id === row.id);
        if (i >= 0) list[i] = row.data; else list.push(row.data);
        this.lastSynced[table][row.id] = JSON.stringify(row.data);   // 更新快照，避免 echo 回推
      }
      store.persist(false);
      renderAll();
      this.syncing = false;
    };
    this.client.channel("cc-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, apply("projects", "projects"))
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule" }, apply("schedule", "schedule"))
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, apply("members", "members"))
      .on("postgres_changes", { event: "*", schema: "public", table: "activity" }, apply("activity", "activity"))
      .on("postgres_changes", { event: "*", schema: "public", table: "meta" }, payload => {
        if (payload.new?.key === "categories") { store.categories = payload.new.data; store.persist(false); renderAll(); }
      })
      .subscribe();
  },

  /* --- 在線狀態（Realtime Presence，不需資料表） --- */
  joinPresence() {
    if (!this.user) return;
    const myName = (this.user.email || "user").split("@")[0];
    const ch = this.client.channel("cc-presence", { config: { presence: { key: this.user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      onlineList = []; onlineLower = new Set(); onlineCount = 0;
      for (const key in state) {
        onlineCount++;                       // 一個 key = 一位登入者（同人多分頁也算一個）
        const nm = state[key][0]?.name || "?";
        onlineList.push(nm);
        onlineLower.add(nm.toLowerCase());
      }
      renderPresence();
      renderMembers();
    });
    ch.subscribe(async status => {
      if (status === "SUBSCRIBED") await ch.track({ name: myName, email: this.user.email });
    });
    this.presenceChannel = ch;
  },
};

/* ============================================================
   啟動
   ============================================================ */
function maybeAutoBrief() {
  const t = todayStr();
  if (localStorage.getItem("cc_lastBrief") !== t) {
    localStorage.setItem("cc_lastBrief", t);
    openBrief();
  }
}

async function boot() {
  cloud.init();
  store.load();                              // 先載 localStorage（快取／單人模式）
  bindEvents();
  const authed = await cloud.requireAuth();  // 未登入 → 停在登入頁
  if (!authed) return;
  if (cloud.enabled()) {
    $("#railLogout").hidden = false;
    await cloud.pullAll();                    // 雲端為準
    cloud.subscribe();
    cloud.joinPresence();                     // 在線狀態
  }
  generateRepeatInstances();
  renderAll();
  maybeAutoBrief();
}
boot();
