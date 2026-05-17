const MS_DAY = 86400000;
const todayIso = new Date().toISOString().slice(0, 10);
const CURRENT_SCHEMA_VERSION = 1;
let persistenceBlocked = false;

const designs = [
  { id: "ledger", label: "Ledger", className: "" },
  { id: "command", label: "Command", className: "theme-command" },
  { id: "calendar", label: "Calendar", className: "theme-calendar" },
  { id: "studio", label: "Studio", className: "theme-studio" },
  { id: "compact", label: "Compact", className: "theme-compact" }
];

const defaultProjects = [
  {
    id: "p_icasis",
    name: "ICASIS",
    tasks: [
      { id: "icasisMeeting", name: "Meetings" },
      { id: "icasisDaily", name: "Daily" },
      { id: "tickets", name: "Tickets" },
      { id: "misc", name: "Misc" }
    ]
  },
  {
    id: "p_meetings",
    name: "Meetings",
    tasks: [
      { id: "prodDemo", name: "ProdDemo" },
      { id: "refinement", name: "Refinement" },
      { id: "retro", name: "Retro" }
    ]
  },
  {
    id: "p_onsite",
    name: "On-site",
    tasks: [
      { id: "office", name: "Office" },
      { id: "conference", name: "Conference" }
    ]
  },
  {
    id: "p_other",
    name: "Other",
    tasks: [{ id: "general", name: "General" }]
  }
];

const defaultTimesheet = {
  id: "ts_work",
  name: "Work Timesheet",
  projectIds: defaultProjects.map(project => project.id)
};

const state = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  year: 2026,
  month: 4,
  design: new URLSearchParams(location.search).get("design") || "command",
  activeView: "timesheet",
  activeTimesheetId: defaultTimesheet.id,
  projects: structuredClone(defaultProjects),
  timesheets: [structuredClone(defaultTimesheet)],
  config: {
    coreStart: "08:00",
    coreEnd: "17:00",
    breakMinutes: 60,
    dailyHours: 8,
    includeAssumption: true
  },
  entries: {},
  collapsedWeeks: {},
  closedMonths: {},
  appNotice: ""
};

boot();

async function boot() {
  await load();
  ensureStateShape();
  seedEntries();
  save();
  render();
}

async function load() {
  let saved = "";
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (response.ok) {
      const remote = await response.json();
      if (remote && Object.keys(remote).length) saved = JSON.stringify(remote);
    }
  } catch {
    saved = "";
  }

  if (!saved) saved = localStorage.getItem("timetrack-bavaria");
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if ((parsed.schemaVersion || 0) > CURRENT_SCHEMA_VERSION) {
      persistenceBlocked = true;
      state.appNotice = `This data was created by a newer app schema (${parsed.schemaVersion}). Editing is disabled to avoid overwriting it.`;
      Object.assign(state, parsed);
      return;
    }
    Object.assign(state, parsed);
    state.design = new URLSearchParams(location.search).get("design") || parsed.design || "command";
  } catch {
    localStorage.removeItem("timetrack-bavaria");
  }
}

function ensureStateShape() {
  state.schemaVersion = state.schemaVersion || CURRENT_SCHEMA_VERSION;
  if (!Array.isArray(state.projects) || !state.projects.length) state.projects = structuredClone(defaultProjects);
  if (!Array.isArray(state.timesheets) || !state.timesheets.length) state.timesheets = [structuredClone(defaultTimesheet)];
  if (!state.activeTimesheetId || !state.timesheets.some(sheet => sheet.id === state.activeTimesheetId)) {
    state.activeTimesheetId = state.timesheets[0].id;
  }
  state.timesheets.forEach(sheet => {
    if (!Array.isArray(sheet.projectIds)) sheet.projectIds = state.projects.map(project => project.id);
  });
  if (!state.collapsedWeeks || typeof state.collapsedWeeks !== "object") state.collapsedWeeks = {};
  if (!state.closedMonths || typeof state.closedMonths !== "object") state.closedMonths = {};
  if (!state.activeView) state.activeView = "timesheet";
  if (!("appNotice" in state)) state.appNotice = "";

  const entries = state.entries || {};
  const looksLegacy = Object.keys(entries).some(key => /^\d{4}-\d{2}-\d{2}$/.test(key));
  if (looksLegacy) {
    state.entries = { [defaultTimesheet.id]: entries };
  } else {
    state.entries = entries;
  }
  state.timesheets.forEach(sheet => {
    if (!state.entries[sheet.id]) state.entries[sheet.id] = {};
  });
}

function save() {
  if (persistenceBlocked) return;
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  const payload = JSON.stringify(state);
  localStorage.setItem("timetrack-bavaria", payload);
  fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload
  }).catch(() => {});
}

function seedEntries() {
  const entries = activeEntries();
  const sample = {
    "2026-03-02": { start: "08:00", end: "17:00", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 4.5, icasisDaily: 0.5, refinement: 1.5, office: 1.5 },
    "2026-03-03": { start: "08:15", end: "17:10", breakMinutes: 60, extraMinutes: 10, status: "work", tickets: 5.25, prodDemo: 1, misc: 0.5 },
    "2026-03-04": { start: "08:00", end: "16:30", breakMinutes: 45, extraMinutes: 0, status: "onsite", tickets: 3.5, office: 3, conference: 1 },
    "2026-03-09": { start: "08:10", end: "17:20", breakMinutes: 60, extraMinutes: 20, status: "work", tickets: 5, icasisMeeting: 1, refinement: 1 },
    "2026-03-10": { start: "08:00", end: "16:45", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 4.75, retro: 0.5, general: 1 },
    "2026-03-16": { start: "08:00", end: "17:00", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 5.5, icasisDaily: 0.5, misc: 1 },
    "2026-03-17": { start: "08:30", end: "16:30", breakMinutes: 45, extraMinutes: 0, status: "sick", comment: "Half-day sick" },
    "2026-03-23": { start: "08:00", end: "17:25", breakMinutes: 60, extraMinutes: 25, status: "work", tickets: 6, prodDemo: 1, office: 1.25 },
    "2026-03-24": { start: "08:00", end: "16:50", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 4.5, refinement: 2, general: 0.5 },
    "2026-04-01": { start: "08:00", end: "17:00", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 5, icasisDaily: 0.5, refinement: 1, misc: 0.5 },
    "2026-04-02": { start: "08:15", end: "16:45", breakMinutes: 45, extraMinutes: 0, status: "onsite", office: 4, conference: 1, tickets: 2 },
    "2026-04-07": { start: "08:00", end: "17:30", breakMinutes: 60, extraMinutes: 30, status: "work", tickets: 5.5, prodDemo: 1, icasisMeeting: 1 },
    "2026-04-08": { start: "08:00", end: "16:30", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 4, refinement: 1.5, retro: 0.5 },
    "2026-04-13": { start: "08:05", end: "17:00", breakMinutes: 60, extraMinutes: 5, status: "work", tickets: 5, icasisDaily: 0.5, general: 1 },
    "2026-04-14": { start: "08:00", end: "17:10", breakMinutes: 60, extraMinutes: 10, status: "work", tickets: 5.25, misc: 1, refinement: 1 },
    "2026-04-20": { start: "08:00", end: "16:20", breakMinutes: 45, extraMinutes: 0, status: "work", tickets: 4.5, prodDemo: 1, office: 1 },
    "2026-04-21": { start: "08:00", end: "17:00", breakMinutes: 60, extraMinutes: 0, status: "ooo", comment: "OOO appointment" },
    "2026-05-04": { start: "08:05", end: "17:10", breakMinutes: 60, extraMinutes: 10, status: "work", icasisDaily: 0.5, tickets: 4.5, refinement: 1, office: 2 },
    "2026-05-05": { start: "08:00", end: "16:45", breakMinutes: 45, extraMinutes: 0, status: "work", icasisMeeting: 1, tickets: 5, prodDemo: 1, misc: 0.75 },
    "2026-05-06": { start: "08:10", end: "17:25", breakMinutes: 60, extraMinutes: 25, status: "work", icasisDaily: 0.5, tickets: 6, retro: 0.5, general: 1 },
    "2026-05-07": { start: "08:00", end: "17:00", breakMinutes: 60, extraMinutes: 0, status: "work", tickets: 5.5, refinement: 1.5, conference: 1 },
    "2026-05-08": { start: "08:20", end: "15:55", breakMinutes: 45, extraMinutes: 65, status: "work", icasisDaily: 0.5, tickets: 4.75, misc: 1 },
    "2026-05-11": { start: "08:00", end: "16:30", breakMinutes: 60, extraMinutes: 86, status: "work", tickets: 5.25, prodDemo: 1, office: 2.25 },
    "2026-05-12": { start: "08:00", end: "16:30", breakMinutes: 60, extraMinutes: 0, status: "work", icasisDaily: 0.5, tickets: 4, refinement: 1, general: 1 }
  };

  if (state.activeTimesheetId !== defaultTimesheet.id) return;
  for (const [date, entry] of Object.entries(sample)) {
    if (!entries[date]) entries[date] = entry;
  }
}

function render() {
  const design = designs.find(item => item.id === state.design) || designs[0];
  document.body.className = design.className;
  const days = monthDays(state.year, state.month);
  ensureWeekCollapseDefaults(days);
  const columns = taskColumns();
  const totals = calculateTotals(days, columns);
  const app = document.getElementById("app");
  const activeSheet = activeTimesheet();
  const monthClosed = isMonthClosed();
  const warnings = validationWarnings(days, columns);

  app.innerHTML = `
    <main class="app">
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            <h1>TimeTrack Bavaria</h1>
            <p>Configurable timesheets, project subtasks, monthly history, actual hours, reported buckets, and Bavaria public holidays.</p>
          </div>
          <div>
            <div class="controls">
              <label>Timesheet ${timesheetSelect()}</label>
              <label>Month <input type="month" id="monthPicker" value="${state.year}-${pad(state.month + 1)}"></label>
              <label>History ${monthHistorySelect()}</label>
              <label>Core start <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="08:00" data-config="coreStart" value="${state.config.coreStart}"></label>
              <label>Core end <input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="17:00" data-config="coreEnd" value="${state.config.coreEnd}"></label>
              <label>Break min <input type="number" data-config="breakMinutes" min="0" step="5" value="${state.config.breakMinutes}"></label>
              <label>Daily target <input type="number" data-config="dailyHours" min="1" step="0.25" value="${state.config.dailyHours}"></label>
            </div>
            <div class="designs" aria-label="Design choices">${designs.map(item => `<button type="button" data-design="${item.id}" class="${item.id === state.design ? "active" : ""}">${item.label}</button>`).join("")}</div>
          </div>
        </header>

        <nav class="app-tabs" aria-label="Main views">
          <button type="button" data-view="timesheet" class="${state.activeView === "timesheet" ? "active" : ""}">Timesheet</button>
          <button type="button" data-view="control" class="${state.activeView === "control" ? "active" : ""}">Control Panel</button>
        </nav>

        ${state.appNotice ? `<div class="notice">${escapeHtml(state.appNotice)}</div>` : ""}

        ${state.activeView === "control" ? `
        <section class="control-panel panel">
          <div class="section-head">
            <h2>Control Panel</h2>
            <span>${escapeHtml(activeSheet.name)} uses ${activeSheet.projectIds.length} project${activeSheet.projectIds.length === 1 ? "" : "s"}</span>
          </div>
          <div class="control-grid">
            <div>
              <h3>Timesheets</h3>
              <div class="data-actions">
                <button type="button" id="exportState">Export JSON</button>
                <button type="button" id="importState">Import JSON</button>
                <button type="button" id="exportCsv">Export CSV</button>
                <button type="button" id="exportActualCsv">Export Actual CSV</button>
                <button type="button" id="importCsv">Import CSV</button>
                <input id="importFile" type="file" accept="application/json,.json" hidden>
                <input id="importCsvFile" type="file" accept="text/csv,.csv" hidden>
              </div>
              <div class="inline-editor">
                <input id="newTimesheetName" type="text" placeholder="New timesheet name">
                <button type="button" id="addTimesheet">Add</button>
              </div>
              <div class="sheet-list">${state.timesheets.map(sheet => sheetCard(sheet)).join("")}</div>
            </div>
            <div>
              <h3>Projects In This Timesheet</h3>
              <div class="project-picker">${state.projects.map(project => projectToggle(project, activeSheet)).join("")}</div>
              <div class="inline-editor">
                <input id="newProjectName" type="text" placeholder="New project title">
                <button type="button" id="addProject">Add project</button>
              </div>
            </div>
            <div>
              <h3>Subtasks</h3>
              ${taskProjectHint()}
              <div class="inline-editor">
                <select id="taskProject">${state.projects.map(project => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("")}</select>
                <input id="newTaskName" type="text" placeholder="New subtask">
                <button type="button" id="addTask">Add</button>
              </div>
              <div class="task-list">${state.projects.map(project => projectTaskList(project)).join("")}</div>
            </div>
          </div>
        </section>
        ` : ""}

        ${state.activeView === "timesheet" ? `
        <section class="summary-grid" aria-label="Month summary">
          ${metric("Workdays", totals.targetDays, `${totals.holidays} holiday${totals.holidays === 1 ? "" : "s"} deducted`)}
          ${metric("Month target", hours(totals.targetHours), "Sick and OOO days stay in target")}
          ${metric("Actual logged", hours(totals.actualHours), `${hours(totals.monthRemaining)} remaining`)}
          ${metric("Reported", hours(totals.reportedHours), `${signedHours(totals.reportedVsActual)} vs actual`)}
          ${metric("Extra time", hours(totals.extraHours), "Outside core working hours")}
        </section>

        <section class="main-grid">
          <div class="panel">
            <div class="section-head">
              <h2>${escapeHtml(activeSheet.name)} - Monthly Timesheet</h2>
              <div class="section-actions">
                <button type="button" id="toggleMonthClosed">${monthClosed ? "Unlock month" : "Close month"}</button>
                <button type="button" id="resetMonth" ${monthClosed ? "disabled" : ""}>Reset month</button>
              </div>
            </div>
            ${monthClosed ? `<div class="closed-banner">This month is closed. Unlock it to edit entries.</div>` : ""}
            <div class="table-wrap">
              <table style="min-width:${tableMinWidth(columns)}px">
                <thead>
                  <tr class="group-head">
                    <th colspan="10">Daily Ledger</th>
                    ${projectGroups(columns).map(group => `<th class="group-separator" colspan="${group.count}">${escapeHtml(group.label)}</th>`).join("")}
                  </tr>
                  <tr>
                    <th>Date</th><th>Status</th><th>Start</th><th>Break</th><th>End</th><th>Extra</th><th>Actual</th><th>Reported</th><th>Gap</th><th>Comments</th>
                    ${columns.map((column, index) => `<th class="${isProjectStart(columns, index) ? "group-separator" : ""}">${escapeHtml(column.taskName)}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>${timesheetRows(days, columns)}</tbody>
              </table>
            </div>
          </div>

          <aside class="side">
            <section class="panel">
              <div class="section-head"><h2>Weekly Forecast</h2></div>
              <div class="side-body week-list" id="weeklyForecastBody">${weekTemplates(days, columns)}</div>
            </section>

            <section class="panel">
              <div class="section-head"><h2>Validation</h2><span>${warnings.length} warning${warnings.length === 1 ? "" : "s"}</span></div>
              <div class="side-body" id="validationBody">${validationPanel(warnings)}</div>
            </section>

            <section class="panel">
              <div class="section-head"><h2>Rules</h2></div>
              <div class="side-body legend">
                <div class="legend-row"><span class="swatch"></span><span>Core day defaults to 08:00-17:00 minus 60 minutes break.</span></div>
                <div class="legend-row"><span class="swatch holiday"></span><span>German/Bavaria public holidays reduce expected working hours.</span></div>
                <div class="legend-row"><span class="swatch away"></span><span>Sick and OOO flags do not reduce the monthly target.</span></div>
                <label><input type="checkbox" id="assumptionToggle" ${state.config.includeAssumption ? "checked" : ""}> Include Assumption Day, 15 Aug</label>
              </div>
            </section>

            <section class="panel">
              <div class="section-head"><h2>Category Mix</h2></div>
              <div class="side-body" id="categoryMixBody">${categoryMix(totals, columns)}</div>
            </section>

            <section class="panel">
              <div class="section-head"><h2>Trends</h2></div>
              <div class="side-body" id="trendBody">${trendPanel(columns)}</div>
            </section>
          </aside>
        </section>
        ` : ""}
        <p class="footer-note">Data is stored locally in this browser. Each timesheet keeps separate monthly entries, so previous months remain browseable through the History and Month controls.</p>
      </div>
    </main>`;

  bindEvents();
}

function metric(label, value, note) {
  return `<article class="panel metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
}

function bindEvents() {
  document.querySelectorAll("[data-design]").forEach(button => {
    button.addEventListener("click", () => {
      state.design = button.dataset.design;
      save();
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", event => {
      state.activeView = event.currentTarget.dataset.view;
      save();
      render();
    });
  });

  document.getElementById("timesheetPicker").addEventListener("change", event => {
    state.activeTimesheetId = event.target.value;
    ensureStateShape();
    save();
    render();
  });

  document.getElementById("monthPicker").addEventListener("change", event => {
    setMonthValue(event.target.value);
  });

  document.getElementById("historyPicker").addEventListener("change", event => {
    if (event.target.value) setMonthValue(event.target.value);
  });

  document.querySelectorAll("[data-config]").forEach(input => {
    input.addEventListener("change", event => {
      const key = event.target.dataset.config;
      if (key === "coreStart" || key === "coreEnd") state.config[key] = normalizeTime(event.target.value);
      else state.config[key] = input.type === "number" ? Number(event.target.value) : event.target.value;
      save();
      render();
    });
  });

  document.getElementById("assumptionToggle")?.addEventListener("change", event => {
    state.config.includeAssumption = event.target.checked;
    save();
    render();
  });

  document.getElementById("resetMonth")?.addEventListener("click", () => {
    if (isMonthClosed()) return;
    if (!confirm("Reset all entries for this month?")) return;
    monthDays(state.year, state.month).forEach(day => delete activeEntries()[day.iso]);
    save();
    render();
  });

  document.querySelectorAll("[data-date]").forEach(input => {
    input.addEventListener("change", event => {
      if (isMonthClosed()) return;
      const date = event.target.dataset.date;
      const key = event.target.dataset.key;
      const entry = getEntry(date);
      if (key === "start" || key === "end") entry[key] = normalizeTime(event.target.value);
      else if (event.target.dataset.number === "decimal") entry[key] = parseDecimalInput(event.target.value);
      else if (event.target.type === "number") entry[key] = Number(event.target.value || 0);
      else entry[key] = event.target.value;
      activeEntries()[date] = entry;
      save();
      refreshCalculationsInPlace(date);
    });
  });

  document.querySelectorAll("[data-week-toggle]").forEach(button => {
    button.addEventListener("click", event => {
      const week = event.currentTarget.dataset.weekToggle;
      collapsedWeeks()[week] = !isWeekCollapsed(week);
      save();
      render();
    });
  });

  document.querySelectorAll("[data-project-toggle]").forEach(input => {
    input.addEventListener("change", event => {
      const sheet = activeTimesheet();
      const id = event.target.dataset.projectToggle;
      if (event.target.checked && !sheet.projectIds.includes(id)) sheet.projectIds.push(id);
      if (!event.target.checked) sheet.projectIds = sheet.projectIds.filter(projectId => projectId !== id);
      save();
      render();
    });
  });

  document.querySelectorAll("[data-delete-sheet]").forEach(button => {
    button.addEventListener("click", event => {
      const id = event.currentTarget.dataset.deleteSheet;
      if (state.timesheets.length <= 1) return;
      const sheet = state.timesheets.find(item => item.id === id);
      const count = Object.keys(state.entries[id] || {}).length;
      if (count && !confirm(`Delete "${sheet?.name || "timesheet"}" and ${count} saved day entries?`)) return;
      state.timesheets = state.timesheets.filter(sheet => sheet.id !== id);
      delete state.entries[id];
      if (state.activeTimesheetId === id) state.activeTimesheetId = state.timesheets[0].id;
      save();
      render();
    });
  });

  document.querySelectorAll("[data-delete-project]").forEach(button => {
    button.addEventListener("click", event => {
      const id = event.currentTarget.dataset.deleteProject;
      const taskIds = new Set((state.projects.find(project => project.id === id)?.tasks || []).map(task => task.id));
      const usage = projectUsage(id);
      if ((taskIds.size || usage) && !confirm(`Delete this project, ${taskIds.size} subtasks, and remove it from ${usage} timesheet(s)?`)) return;
      state.projects = state.projects.filter(project => project.id !== id);
      state.timesheets.forEach(sheet => {
        sheet.projectIds = sheet.projectIds.filter(projectId => projectId !== id);
      });
      Object.values(state.entries).forEach(entriesByDate => {
        Object.values(entriesByDate).forEach(entry => {
          taskIds.forEach(taskId => delete entry[taskId]);
        });
      });
      save();
      render();
    });
  });

  document.querySelectorAll("[data-delete-task]").forEach(button => {
    button.addEventListener("click", event => {
      const [projectId, taskId] = event.currentTarget.dataset.deleteTask.split(":");
      const project = state.projects.find(item => item.id === projectId);
      if (!project) return;
      if (taskHasEntries(taskId) && !confirm("Delete this subtask and all historical hours recorded against it?")) return;
      project.tasks = project.tasks.filter(task => task.id !== taskId);
      Object.values(state.entries).forEach(entriesByDate => {
        Object.values(entriesByDate).forEach(entry => delete entry[taskId]);
      });
      save();
      render();
    });
  });

  document.getElementById("addTimesheet")?.addEventListener("click", () => {
    const input = document.getElementById("newTimesheetName");
    const name = input.value.trim();
    if (!name) return;
    const sheet = { id: uniqueId("ts"), name, projectIds: [] };
    state.timesheets.push(sheet);
    state.entries[sheet.id] = {};
    state.activeTimesheetId = sheet.id;
    save();
    render();
  });

  document.getElementById("addProject")?.addEventListener("click", () => {
    const input = document.getElementById("newProjectName");
    const name = input.value.trim();
    if (!name) return;
    const project = { id: uniqueId("p"), name, tasks: [] };
    state.projects.push(project);
    activeTimesheet().projectIds.push(project.id);
    save();
    render();
  });

  document.getElementById("addTask")?.addEventListener("click", () => {
    const projectId = document.getElementById("taskProject").value;
    const input = document.getElementById("newTaskName");
    const name = input.value.trim();
    const project = state.projects.find(item => item.id === projectId);
    if (!name || !project) return;
    project.tasks.push({ id: uniqueId("task"), name });
    save();
    render();
  });

  document.querySelectorAll("[data-rename-sheet]").forEach(input => {
    input.addEventListener("change", event => {
      const sheet = state.timesheets.find(item => item.id === event.target.dataset.renameSheet);
      const name = event.target.value.trim();
      if (sheet && name) sheet.name = name;
      save();
      render();
    });
  });

  document.querySelectorAll("[data-rename-project]").forEach(input => {
    input.addEventListener("change", event => {
      const project = state.projects.find(item => item.id === event.target.dataset.renameProject);
      const name = event.target.value.trim();
      if (project && name) project.name = name;
      save();
      render();
    });
  });

  document.querySelectorAll("[data-rename-task]").forEach(input => {
    input.addEventListener("change", event => {
      const [projectId, taskId] = event.target.dataset.renameTask.split(":");
      const task = state.projects.find(project => project.id === projectId)?.tasks.find(item => item.id === taskId);
      const name = event.target.value.trim();
      if (task && name) task.name = name;
      save();
      render();
    });
  });

  document.getElementById("toggleMonthClosed")?.addEventListener("click", () => {
    const key = monthKey();
    const closed = isMonthClosed();
    if (!closed && !confirm("Close this month and make it read-only?")) return;
    if (closed && !confirm("Unlock this month for editing?")) return;
    state.closedMonths[key] = !closed;
    save();
    render();
  });

  document.getElementById("exportState")?.addEventListener("click", () => {
    const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timetrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importState")?.addEventListener("click", () => {
    document.getElementById("importFile")?.click();
  });

  document.getElementById("importFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || ""));
        if ((imported.schemaVersion || 0) > CURRENT_SCHEMA_VERSION) {
          state.appNotice = `Import blocked: backup schema ${imported.schemaVersion} is newer than this app.`;
          render();
          return;
        }
        if (!confirm("Import this backup and replace the current app state?")) return;
        Object.keys(state).forEach(key => delete state[key]);
        Object.assign(state, imported);
        ensureStateShape();
        save();
        render();
      } catch {
        state.appNotice = "Import failed: the selected file is not valid JSON.";
        render();
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("exportCsv")?.addEventListener("click", () => {
    const csv = buildMonthCsv(taskColumns());
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timetrack-${safeFileName(activeTimesheet().name)}-${state.year}-${pad(state.month + 1)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("exportActualCsv")?.addEventListener("click", () => {
    const csv = buildActualMonthCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timetrack-actual-${safeFileName(activeTimesheet().name)}-${state.year}-${pad(state.month + 1)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("importCsv")?.addEventListener("click", () => {
    if (isMonthClosed()) {
      state.appNotice = "CSV import blocked: unlock this month before importing.";
      render();
      return;
    }
    document.getElementById("importCsvFile")?.click();
  });

  document.getElementById("importCsvFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = importMonthCsv(String(reader.result || ""), taskColumns());
        state.appNotice = `CSV import complete: ${result.updated} row${result.updated === 1 ? "" : "s"} updated for ${state.year}-${pad(state.month + 1)}.`;
        save();
        render();
      } catch (error) {
        state.appNotice = `CSV import failed: ${error.message}`;
        render();
      }
    };
    reader.readAsText(file);
  });
}

function setMonthValue(value) {
  const [year, month] = value.split("-").map(Number);
  state.year = year;
  state.month = month - 1;
  save();
  render();
}

function refreshCalculationsInPlace(date) {
  const columns = taskColumns();
  const days = monthDays(state.year, state.month);
  const day = days.find(item => item.iso === date);
  if (day) {
    const entry = getEntry(date);
    const actual = actualHours(entry, day, hasEntry(date));
    const reported = reportedHours(entry, columns);
    const gap = actual - reported;
    const row = document.querySelector(`[data-row-date="${date}"]`);
    row?.querySelector('[data-cell="actual"]')?.replaceChildren(document.createTextNode(hours(actual)));
    row?.querySelector('[data-cell="reported"]')?.replaceChildren(document.createTextNode(hours(reported)));
    const gapCell = row?.querySelector('[data-cell="gap"]');
    if (gapCell) {
      gapCell.textContent = signedHours(gap);
      gapCell.classList.toggle("negative", gap < 0);
      gapCell.classList.toggle("positive", gap >= 0);
    }
  }

  const totals = calculateTotals(days, columns);
  const warnings = validationWarnings(days, columns);
  const summary = document.querySelector(".summary-grid");
  if (summary) {
    summary.innerHTML = `
      ${metric("Workdays", totals.targetDays, `${totals.holidays} holiday${totals.holidays === 1 ? "" : "s"} deducted`)}
      ${metric("Month target", hours(totals.targetHours), "Sick and OOO days stay in target")}
      ${metric("Actual logged", hours(totals.actualHours), `${hours(totals.monthRemaining)} remaining`)}
      ${metric("Reported", hours(totals.reportedHours), `${signedHours(totals.reportedVsActual)} vs actual`)}
      ${metric("Extra time", hours(totals.extraHours), "Outside core working hours")}`;
  }
  const weekly = document.getElementById("weeklyForecastBody");
  if (weekly) weekly.innerHTML = weekTemplates(days, columns);
  const validation = document.getElementById("validationBody");
  if (validation) validation.innerHTML = validationPanel(warnings);
  const validationCount = validation?.closest(".panel")?.querySelector(".section-head span");
  if (validationCount) validationCount.textContent = `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`;
  const category = document.getElementById("categoryMixBody");
  if (category) category.innerHTML = categoryMix(totals, columns);
  const trend = document.getElementById("trendBody");
  if (trend) trend.innerHTML = trendPanel(columns);
}

function timesheetRows(days, columns) {
  let currentWeek = "";
  return days.map(day => {
    const week = isoWeekKey(day.date);
    const rows = [];
    if (week !== currentWeek) {
      currentWeek = week;
      rows.push(weekHeaderRow(week, days.filter(candidate => isoWeekKey(candidate.date) === week), columns));
    }
    if (!isWeekCollapsed(week)) rows.push(rowTemplate(day, columns));
    return rows.join("");
  }).join("");
}

function weekHeaderRow(week, weekDays, columns) {
  const target = weekDays.reduce((sum, day) => sum + targetHours(day), 0);
  const actual = weekDays.reduce((sum, day) => sum + actualHours(getEntry(day.iso), day, hasEntry(day.iso)), 0);
  const remaining = Math.max(0, target - actual);
  const collapsed = isWeekCollapsed(week);
  const current = isCurrentWeek(week);
  const start = weekDays[0].label;
  const end = weekDays[weekDays.length - 1].label;
  return `<tr class="week-toggle-row ${current ? "current-week" : ""}">
    <td colspan="${10 + columns.length}">
      <button type="button" data-week-toggle="${week}" aria-expanded="${!collapsed}">
        <span>${collapsed ? "+" : "-"}</span>
        <strong>${week}</strong>
        <small>${start}-${end}</small>
        <em>${hours(actual)} logged / ${hours(target)} target / ${hours(remaining)} left</em>
      </button>
    </td>
  </tr>`;
}

function rowTemplate(day, columns) {
  const entry = getEntry(day.iso);
  const actual = actualHours(entry, day, hasEntry(day.iso));
  const reported = reportedHours(entry, columns);
  const gap = actual - reported;
  const isWeekStart = day.date.getDay() === 1 || day.date.getDate() === 1;
  const currentWeek = isCurrentWeek(isoWeekKey(day.date));
  const offDay = entry.status === "sick" || entry.status === "ooo" || entry.status === "free";
  const classNames = [
    isWeekStart ? "week-start" : "",
    currentWeek ? "current-week" : "",
    day.isWeekend ? "weekend" : "",
    day.holiday ? "holiday" : "",
    offDay ? "offday" : "",
    day.iso === todayIso ? "today" : ""
  ].join(" ");
  const holidayLabel = day.holiday ? ` title="${day.holiday}"` : "";
  const disabled = isMonthClosed() ? "disabled" : "";

  return `<tr class="${classNames}" data-row-date="${day.iso}"${holidayLabel}>
    <td><strong>${day.label}</strong> <span class="day-name">${day.weekday}</span></td>
    <td>
      <select data-date="${day.iso}" data-key="status" aria-label="Status for ${day.iso}" ${disabled}>
        ${option("work", "Work", entry.status)}
        ${option("onsite", "On-site", entry.status)}
        ${option("sick", "Sick", entry.status)}
        ${option("ooo", "OOO", entry.status)}
        ${option("free", "Free", entry.status)}
      </select>
    </td>
    <td><input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="08:00" data-date="${day.iso}" data-key="start" value="${entry.start}" ${disabled}></td>
    <td><input type="number" min="0" step="5" data-date="${day.iso}" data-key="breakMinutes" value="${entry.breakMinutes}" ${disabled}></td>
    <td><input type="text" inputmode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="17:00" data-date="${day.iso}" data-key="end" value="${entry.end}" ${disabled}></td>
    <td><input type="number" min="0" step="5" data-date="${day.iso}" data-key="extraMinutes" value="${entry.extraMinutes}" ${disabled}></td>
    <td class="num" data-cell="actual">${hours(actual)}</td>
    <td class="num" data-cell="reported">${hours(reported)}</td>
    <td class="delta ${gap < 0 ? "negative" : "positive"}" data-cell="gap">${signedHours(gap)}</td>
    <td><input class="comment-input" type="text" data-date="${day.iso}" data-key="comment" value="${escapeHtml(entry.comment || "")}" placeholder="${day.holiday || "Note"}" ${disabled}></td>
    ${columns.map((column, index) => `<td class="${isProjectStart(columns, index) ? "group-separator" : ""}"><input class="decimal-input" type="text" inputmode="decimal" data-number="decimal" data-date="${day.iso}" data-key="${column.taskId}" value="${formatEntryNumber(entry[column.taskId] || 0)}" ${disabled}></td>`).join("")}
  </tr>`;
}

function weekTemplates(days) {
  const weeks = new Map();
  days.forEach(day => {
    const key = isoWeekKey(day.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(day);
  });

  return [...weeks.entries()].map(([week, weekDays]) => {
    const target = weekDays.reduce((sum, day) => sum + targetHours(day), 0);
    const logged = weekDays.reduce((sum, day) => sum + actualHours(getEntry(day.iso), day, hasEntry(day.iso)), 0);
    const remaining = Math.max(0, target - logged);
    const pct = target ? Math.min(100, Math.round(logged / target * 100)) : 100;
    return `<div class="week-item">
      <strong>${week}</strong>
      <div class="bar" title="${hours(logged)} / ${hours(target)}"><span style="--value:${pct}%"></span></div>
      <span class="num">${hours(remaining)} left</span>
    </div>`;
  }).join("");
}

function categoryMix(totals, columns) {
  const projectRows = projectGroups(columns).map(group => {
    const value = columns
      .filter(column => column.projectId === group.id)
      .reduce((sum, column) => sum + (totals.categories[column.taskId] || 0), 0);
    return mixRow(group.label, value, totals.reportedHours, "project");
  });

  const rows = columns.map(column => {
    const value = totals.categories[column.taskId] || 0;
    return mixRow(column.taskName, value, totals.reportedHours, "category");
  });
  return `<div class="mix-list">
    <h3>Projects</h3>
    ${projectRows.join("") || `<p class="empty-note">No projects selected.</p>`}
    <h3>Categories</h3>
    ${rows.join("") || `<p class="empty-note">Add subtasks to selected projects.</p>`}
  </div>`;
}

function validationPanel(warnings) {
  if (!warnings.length) return `<p class="empty-note">No warnings for this month.</p>`;
  return `<div class="warning-list">${warnings.map(warning => `
    <div class="warning-item">
      <strong>${escapeHtml(warning.date)}</strong>
      <span>${escapeHtml(warning.message)}</span>
    </div>`).join("")}</div>`;
}

function validationWarnings(days, columns) {
  const warnings = [];
  days.forEach(day => {
    const entry = getEntry(day.iso);
    const logged = hasEntry(day.iso);
    const actual = actualHours(entry, day, logged);
    const reported = reportedHours(entry, columns);
    const target = targetHours(day);
    const hasComment = Boolean((entry.comment || "").trim());

    if (reported > actual && actual > 0) warnings.push({ date: day.label, message: `Reported ${hours(reported)} exceeds actual ${hours(actual)}.` });
    if (actual > target + 2 && target > 0) warnings.push({ date: day.label, message: `Actual ${hours(actual)} is more than 2h above target.` });
    if (actual > 0 && reported === 0) warnings.push({ date: day.label, message: "Actual time exists but no task hours are reported." });
    if (hasComment && actual === 0) warnings.push({ date: day.label, message: "Comment exists on a zero-hour day." });
    if ((day.isWeekend || day.holiday) && reported > 0 && actual === 0) warnings.push({ date: day.label, message: `Weekend/holiday has ${hours(reported)} reported task hours but no actual time.` });
  });
  return warnings;
}

function trendPanel(columns) {
  const months = monthKeysForActiveSheet();
  if (!months.length) return `<p class="empty-note">No monthly history yet.</p>`;
  const rows = months.slice(-6).map(key => {
    const [year, month] = key.split("-").map(Number);
    const days = monthDays(year, month - 1);
    const previousYear = state.year;
    const previousMonth = state.month;
    state.year = year;
    state.month = month - 1;
    const totals = calculateTotals(days, columns);
    state.year = previousYear;
    state.month = previousMonth;
    const pct = totals.targetHours ? Math.min(100, Math.round(totals.actualHours / totals.targetHours * 100)) : 0;
    return `<div class="trend-row">
      <strong>${key}</strong>
      <div class="bar" title="${hours(totals.actualHours)} / ${hours(totals.targetHours)}"><span style="--value:${pct}%"></span></div>
      <span>${hours(totals.actualHours)}</span>
      <small>${hours(totals.reportedHours)}</small>
    </div>`;
  });
  return `<div class="trend-list">
    <div class="trend-head"><span>Month</span><span>Actual / target</span><span>Actual</span><span>Reported</span></div>
    ${rows.join("")}
  </div>`;
}

function mixRow(label, value, total, type) {
  const pct = total ? value / total * 100 : 0;
  return `<div class="mix-row ${type}">
    <strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong>
    <div class="bar" title="${hours(value)} / ${hours(total)}"><span style="--value:${Math.min(100, Math.round(pct))}%"></span></div>
    <span class="mix-value">${hours(value)}</span>
    <span class="mix-percent">${pct.toFixed(1)}%</span>
  </div>`;
}

function calculateTotals(days, columns) {
  const totals = {
    targetDays: 0,
    targetHours: 0,
    actualHours: 0,
    reportedHours: 0,
    reportedGap: 0,
    reportedVsActual: 0,
    extraHours: 0,
    monthRemaining: 0,
    holidays: 0,
    categories: {}
  };

  days.forEach(day => {
    const entry = getEntry(day.iso);
    const target = targetHours(day);
    const logged = hasEntry(day.iso);
    const offDay = entry.status === "sick" || entry.status === "ooo" || entry.status === "free";
    if (target) totals.targetDays += 1;
    if (day.holiday && !day.isWeekend) totals.holidays += 1;
    totals.targetHours += target;
    totals.actualHours += actualHours(entry, day, logged);
    totals.reportedHours += reportedHours(entry, columns);
    if (logged && entry.status !== "sick" && entry.status !== "ooo") {
      totals.extraHours += (Number(entry.extraMinutes) || 0) / 60;
    }
    columns.forEach(column => {
      totals.categories[column.taskId] = (totals.categories[column.taskId] || 0) + (Number(entry[column.taskId]) || 0);
    });
  });
  totals.reportedGap = totals.actualHours - totals.reportedHours;
  totals.reportedVsActual = totals.reportedHours - totals.actualHours;
  totals.monthRemaining = Math.max(0, totals.targetHours - totals.actualHours);
  return totals;
}

function getEntry(date) {
  const day = dateFromIso(date);
  const holiday = holidayName(day.getFullYear(), day.getMonth(), day.getDate());
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const defaults = {
    start: isWeekend || holiday ? "" : state.config.coreStart,
    end: isWeekend || holiday ? "" : state.config.coreEnd,
    breakMinutes: isWeekend || holiday ? 0 : state.config.breakMinutes,
    extraMinutes: 0,
    status: isWeekend || holiday ? "free" : "work"
  };
  return { ...defaults, ...(activeEntries()[date] || {}) };
}

function hasEntry(date) {
  return Boolean(activeEntries()[date]);
}

function actualHours(entry, day, logged) {
  if (!logged) return 0;
  if (entry.status === "sick" || entry.status === "ooo") return 0;
  const start = minutes(entry.start);
  const end = minutes(entry.end);
  const baseMinutes = start == null || end == null || end <= start ? 0 : end - start - Number(entry.breakMinutes || 0);
  return Math.max(0, (baseMinutes + Number(entry.extraMinutes || 0)) / 60);
}

function reportedHours(entry, columns) {
  return columns.reduce((sum, column) => sum + (Number(entry[column.taskId]) || 0), 0);
}

function buildMonthCsv(columns) {
  const headers = [
    "date",
    "status",
    "start",
    "breakMinutes",
    "end",
    "extraMinutes",
    "comment",
    ...columns.map(column => taskCsvHeader(column))
  ];
  const rows = monthDays(state.year, state.month).map(day => {
    const entry = getEntry(day.iso);
    return [
      day.iso,
      entry.status || "work",
      entry.start || "",
      entry.breakMinutes || 0,
      entry.end || "",
      entry.extraMinutes || 0,
      entry.comment || "",
      ...columns.map(column => entry[column.taskId] || 0)
    ];
  });
  return [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function buildActualMonthCsv() {
  const headers = ["date", "start", "end", "breakMinutes", "actualHours", "comments"];
  const rows = monthDays(state.year, state.month).map(day => {
    const entry = getEntry(day.iso);
    return [
      day.iso,
      entry.start || "",
      entry.end || "",
      entry.breakMinutes || 0,
      actualHours(entry, day, hasEntry(day.iso)).toFixed(2),
      entry.comment || ""
    ];
  });
  return [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\n") + "\n";
}

function importMonthCsv(csv, columns) {
  const rows = parseCsv(csv.trim());
  if (rows.length < 2) throw new Error("CSV must contain a header row and at least one data row.");

  const headers = rows[0].map(header => header.trim());
  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const required = ["date", "status", "start", "breakMinutes", "end", "extraMinutes", "comment"];
  const missing = required.filter(header => !(header in index));
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);

  const taskIndexes = columns.map(column => ({
    taskId: column.taskId,
    index: index[taskCsvHeader(column)]
  })).filter(item => item.index !== undefined);

  let updated = 0;
  rows.slice(1).forEach(row => {
    const date = row[index.date]?.trim();
    if (!date) return;
    if (!date.startsWith(`${state.year}-${pad(state.month + 1)}-`)) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}.`);

    const entry = getEntry(date);
    entry.status = row[index.status]?.trim() || "work";
    entry.start = normalizeTime(row[index.start] || "");
    entry.breakMinutes = Number(row[index.breakMinutes] || 0);
    entry.end = normalizeTime(row[index.end] || "");
    entry.extraMinutes = Number(row[index.extraMinutes] || 0);
    entry.comment = row[index.comment] || "";
    taskIndexes.forEach(item => {
      entry[item.taskId] = Number(row[item.index] || 0);
    });
    activeEntries()[date] = entry;
    updated += 1;
  });

  if (!updated) throw new Error("No rows matched the currently selected month.");
  return { updated };
}

function taskCsvHeader(column) {
  return `task:${column.projectName}:${column.taskName}:${column.taskId}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value !== "") || rows.length === 0) rows.push(row);
  return rows;
}

function activeTimesheet() {
  return state.timesheets.find(sheet => sheet.id === state.activeTimesheetId) || state.timesheets[0];
}

function activeEntries() {
  if (!state.entries[state.activeTimesheetId]) state.entries[state.activeTimesheetId] = {};
  return state.entries[state.activeTimesheetId];
}

function monthKey() {
  return `${state.activeTimesheetId}:${state.year}-${pad(state.month + 1)}`;
}

function isMonthClosed() {
  return Boolean(state.closedMonths?.[monthKey()]);
}

function collapsedWeeks() {
  const key = monthKey();
  if (!state.collapsedWeeks[key]) state.collapsedWeeks[key] = {};
  return state.collapsedWeeks[key];
}

function ensureWeekCollapseDefaults(days) {
  const weeks = collapsedWeeks();
  if (weeks.__defaultMode === "current-week-v1") return;
  [...new Set(days.map(day => isoWeekKey(day.date)))].forEach(week => {
    weeks[week] = !isCurrentWeek(week);
  });
  weeks.__defaultMode = "current-week-v1";
}

function isWeekCollapsed(week) {
  const explicit = collapsedWeeks()[week];
  if (explicit !== undefined) return Boolean(explicit);
  return !isCurrentWeek(week);
}

function isCurrentWeek(week) {
  const today = dateFromIso(todayIso);
  if (today.getFullYear() !== state.year || today.getMonth() !== state.month) return false;
  return isoWeekKey(today) === week;
}

function taskColumns() {
  const sheet = activeTimesheet();
  return state.projects
    .filter(project => sheet.projectIds.includes(project.id))
    .flatMap(project => project.tasks.map(task => ({
      projectId: project.id,
      projectName: project.name,
      taskId: task.id,
      taskName: task.name
    })));
}

function projectGroups(columns) {
  const groups = [];
  columns.forEach(column => {
    const last = groups[groups.length - 1];
    if (last && last.id === column.projectId) last.count += 1;
    else groups.push({ id: column.projectId, label: column.projectName, count: 1 });
  });
  return groups;
}

function isProjectStart(columns, index) {
  return index === 0 || columns[index].projectId !== columns[index - 1].projectId;
}

function timesheetSelect() {
  return `<select id="timesheetPicker">${state.timesheets.map(sheet => `<option value="${sheet.id}" ${sheet.id === state.activeTimesheetId ? "selected" : ""}>${escapeHtml(sheet.name)}</option>`).join("")}</select>`;
}

function monthHistorySelect() {
  const months = new Set([`${state.year}-${pad(state.month + 1)}`]);
  Object.keys(activeEntries()).forEach(date => months.add(date.slice(0, 7)));
  const sorted = [...months].sort().reverse();
  return `<select id="historyPicker">${sorted.map(month => `<option value="${month}" ${month === `${state.year}-${pad(state.month + 1)}` ? "selected" : ""}>${month}</option>`).join("")}</select>`;
}

function monthKeysForActiveSheet() {
  return [...new Set(Object.keys(activeEntries()).map(date => date.slice(0, 7)))].sort();
}

function sheetCard(sheet) {
  const active = sheet.id === state.activeTimesheetId;
  const canDelete = state.timesheets.length > 1;
  return `<div class="sheet-card ${active ? "active" : ""}" data-sheet-id="${sheet.id}">
    <span>
      <input type="text" data-rename-sheet="${sheet.id}" value="${escapeHtml(sheet.name)}" aria-label="Rename ${escapeHtml(sheet.name)}">
      <small>${sheet.projectIds.length} project${sheet.projectIds.length === 1 ? "" : "s"}</small>
    </span>
    ${canDelete ? `<button type="button" data-delete-sheet="${sheet.id}" aria-label="Delete ${escapeHtml(sheet.name)}">Delete</button>` : ""}
  </div>`;
}

function projectToggle(project, sheet) {
  const checked = sheet.projectIds.includes(project.id);
  return `<div class="project-toggle">
    <label>
      <input type="checkbox" data-project-toggle="${project.id}" ${checked ? "checked" : ""}>
      <span>
        <input type="text" data-rename-project="${project.id}" value="${escapeHtml(project.name)}" aria-label="Rename ${escapeHtml(project.name)}">
        <small>${project.tasks.length} subtask${project.tasks.length === 1 ? "" : "s"} · used in ${projectUsage(project.id)} timesheet${projectUsage(project.id) === 1 ? "" : "s"}</small>
      </span>
    </label>
    <button type="button" data-delete-project="${project.id}" aria-label="Delete ${escapeHtml(project.name)}">Delete</button>
  </div>`;
}

function projectTaskList(project) {
  return `<div class="task-group">
    <strong>${escapeHtml(project.name)}</strong>
    <span>${project.tasks.map(task => `
      <span class="task-chip">
        <input type="text" data-rename-task="${project.id}:${task.id}" value="${escapeHtml(task.name)}" aria-label="Rename ${escapeHtml(task.name)}">
        <button type="button" data-delete-task="${project.id}:${task.id}" title="Delete ${escapeHtml(task.name)}">Delete</button>
      </span>`).join("") || "No subtasks yet"}</span>
  </div>`;
}

function taskProjectHint() {
  if (!state.projects.length) return `<p class="empty-note">Create a project before adding subtasks.</p>`;
  return `<p class="empty-note">Choose the project that should receive the new subtask.</p>`;
}

function projectUsage(projectId) {
  return state.timesheets.filter(sheet => sheet.projectIds.includes(projectId)).length;
}

function taskHasEntries(taskId) {
  return Object.values(state.entries).some(entriesByDate =>
    Object.values(entriesByDate).some(entry => Number(entry[taskId]) > 0)
  );
}

function tableMinWidth(columns) {
  return 1040 + columns.length * 96;
}

function targetHours(day) {
  if (day.isWeekend || day.holiday) return 0;
  return Number(state.config.dailyHours) || 8;
}

function monthDays(year, month) {
  const count = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month, index + 1);
    const iso = toIso(date);
    return {
      date,
      iso,
      label: `${pad(index + 1)}.${pad(month + 1)}`,
      weekday: date.toLocaleDateString("en-GB", { weekday: "short" }),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      holiday: holidayName(year, month, index + 1)
    };
  });
}

function holidayName(year, month, day) {
  const fixed = {
    "0-1": "New Year's Day",
    "0-6": "Epiphany",
    "4-1": "Labour Day",
    "9-3": "German Unity Day",
    "10-1": "All Saints' Day",
    "11-25": "Christmas Day",
    "11-26": "Second Christmas Day"
  };
  if (state.config.includeAssumption) fixed["7-15"] = "Assumption Day";
  const key = `${month}-${day}`;
  if (fixed[key]) return fixed[key];

  const easter = easterSunday(year);
  const diff = Math.round((new Date(year, month, day) - easter) / MS_DAY);
  const moving = {
    "-2": "Good Friday",
    "1": "Easter Monday",
    "39": "Ascension Day",
    "50": "Whit Monday",
    "60": "Corpus Christi"
  };
  return moving[String(diff)] || "";
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function isoWeekKey(date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((copy - yearStart) / MS_DAY) + 1) / 7);
  return `W${pad(weekNo)}`;
}

function minutes(value) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59 || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function parseDecimalInput(value) {
  const normalized = String(value || "").trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTime(value) {
  const cleaned = String(value || "").trim();
  const match = cleaned.match(/^(\d{1,2}):?(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return "";
  return `${pad(hour)}:${pad(minute)}`;
}

function hours(value) {
  return `${(Math.round(value * 100) / 100).toFixed(2)}h`;
}

function formatEntryNumber(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}

function signedHours(value) {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}h`;
}

function option(value, label, current) {
  return `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function uniqueId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeFileName(value) {
  return String(value || "timesheet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "timesheet";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateFromIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
