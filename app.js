const STORAGE_KEY = "todolist-items";

const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importInput = document.getElementById("import-input");
const sortTimeButton = document.getElementById("sort-time");
const sortAlphaButton = document.getElementById("sort-alpha");
const clearButton = document.getElementById("clear-button");
const clearWarning = document.getElementById("clear-warning");
const clearCancel = document.getElementById("clear-cancel");
const clearConfirm = document.getElementById("clear-confirm");
const saveStatus = document.getElementById("save-status");
const todoList = document.getElementById("todo-list");

let editingId = null;

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item && typeof item.text === "string");
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function withIds(items) {
  let changed = false;
  for (const item of items) {
    if (!item.id) {
      item.id = crypto.randomUUID();
      changed = true;
    }
    if (typeof item.done !== "boolean") {
      item.done = false;
      changed = true;
    }
  }
  if (changed) {
    saveItems(items);
  }
  return items;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function fieldText(value) {
  return String(value || "").replace(/\u00a0/g, " ").trim();
}

function renderItems(items) {
  const draft = document.getElementById("add-input")?.value || "";
  const addFocused = document.activeElement?.id === "add-input";
  const editDraft = document.querySelector(".todo-edit-input")?.value;
  todoList.replaceChildren();

  for (const item of items) {
    const rowItem = document.createElement("li");
    rowItem.className = "todo-item";
    rowItem.dataset.id = item.id;
    if (item.done) {
      rowItem.classList.add("is-done");
    }
    if (item.id === editingId) {
      rowItem.classList.add("is-editing");
    }

    const row = document.createElement("div");
    row.className = "todo-row";

    const check = document.createElement("button");
    check.type = "button";
    check.className = "todo-check";
    check.setAttribute("aria-pressed", item.done ? "true" : "false");
    check.setAttribute("aria-label", item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`);
    check.addEventListener("click", () => toggleItem(item.id));

    const text = document.createElement("button");
    text.type = "button";
    text.className = "todo-text";
    text.textContent = item.text;
    text.addEventListener("click", () => beginEdit(item.id));

    const grip = document.createElement("button");
    grip.type = "button";
    grip.className = "todo-grip";
    grip.setAttribute("aria-label", `Drag to reorder ${item.text}`);
    grip.title = "Drag to reorder";
    bindDrag(grip, rowItem);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-delete";
    remove.setAttribute("aria-label", `Delete ${item.text}`);
    remove.title = "Delete";
    remove.addEventListener("click", () => deleteItem(item.id));

    row.append(check, text, grip, remove);
    rowItem.append(row);
    todoList.append(rowItem);

    if (item.id === editingId) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "todo-edit-input";
      input.value = editDraft != null ? editDraft : item.text;
      input.setAttribute("aria-label", "Edit item");
      input.autocomplete = "off";
      text.replaceWith(input);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitEdit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
        }
      });
      input.addEventListener("blur", () => {
        window.setTimeout(() => {
          if (editingId === item.id && document.activeElement !== input) {
            commitEdit();
          }
        }, 0);
      });
    }
  }

  todoList.append(createAddRow(draft));
  if (addFocused) {
    document.getElementById("add-input")?.focus();
  }
}

function createAddRow(draft) {
  const rowItem = document.createElement("li");
  rowItem.className = "todo-item todo-add";

  const row = document.createElement("div");
  row.className = "todo-row";

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "todo-plus";
  plus.setAttribute("aria-label", "Add an item");
  plus.title = "Add";
  plus.addEventListener("click", () => {
    const input = document.getElementById("add-input");
    if (fieldText(input?.value)) {
      addItem();
      return;
    }
    input?.focus();
  });

  const input = document.createElement("input");
  input.id = "add-input";
  input.type = "text";
  input.className = "todo-add-input";
  input.setAttribute("aria-label", "New item");
  input.autocomplete = "off";
  input.value = draft;
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addItem();
    } else if (event.key === "Escape") {
      event.preventDefault();
      input.value = "";
    }
  });

  row.append(plus, input);
  rowItem.append(row);
  return rowItem;
}

function itemsToText(items) {
  return items.map((item) => `- [${item.done ? "x" : " "}] ${item.text}`).join("\n");
}

function parseListText(text) {
  const items = [];
  const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (const line of normalized.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let done = false;
    let body = trimmed;
    let match = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (match) {
      done = match[1].toLowerCase() === "x";
      body = match[2];
    } else if ((match = trimmed.match(/^\[([ xX])\]\s*(.*)$/))) {
      done = match[1].toLowerCase() === "x";
      body = match[2];
    } else if ((match = trimmed.match(/^[-*+]\s+(.*)$/))) {
      body = match[1];
    } else if ((match = trimmed.match(/^\d+[.)]\s+(.*)$/))) {
      body = match[1];
    }

    body = body.trim();
    if (!body) {
      continue;
    }

    items.push({
      id: crypto.randomUUID(),
      text: body,
      done,
      createdAt: new Date().toISOString(),
    });
  }

  return items;
}

let saveStatusTimer = 0;

function showSaveStatus(message) {
  saveStatus.hidden = false;
  saveStatus.textContent = message;
  window.clearTimeout(saveStatusTimer);
  saveStatusTimer = window.setTimeout(() => {
    saveStatus.hidden = true;
    saveStatus.textContent = "";
  }, 5000);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text.endsWith("\n") ? text : `${text}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}

function exportFilename(date) {
  return `ToDoList_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}.txt`;
}

function exportList() {
  const items = withIds(loadItems());
  if (items.length === 0) {
    showSaveStatus("Nothing to export yet. Add an item first.");
    return;
  }

  const filename = exportFilename(new Date());
  downloadTextFile(filename, itemsToText(items));
  showSaveStatus(`Downloaded ${filename}. Check Downloads if it doesn't open.`);
}

function replaceList(items, message) {
  saveItems(items);
  editingId = null;
  renderItems(items);
  showSaveStatus(message);
}

function applyImportedList(text) {
  const imported = parseListText(text);
  if (imported.length === 0) {
    showSaveStatus("That file has no items to import.");
    return;
  }
  if (loadItems().length > 0 && !window.confirm("Replace the current list with this file?")) {
    return;
  }
  const label = imported.length === 1 ? "item" : "items";
  replaceList(imported, `Imported ${imported.length} ${label}.`);
}

function importListFile(file) {
  const reader = new FileReader();
  reader.onload = () => applyImportedList(String(reader.result || ""));
  reader.readAsText(file);
}

function toggleItem(id) {
  if (editingId) {
    commitEdit();
  }
  const items = withIds(loadItems());
  const item = items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  item.done = !item.done;
  saveItems(items);
  renderItems(items);
}

function deleteItem(id) {
  if (editingId === id) {
    editingId = null;
  } else if (editingId) {
    commitEdit();
  }
  const items = withIds(loadItems()).filter((item) => item.id !== id);
  saveItems(items);
  renderItems(items);
}

function showClearWarning() {
  if (loadItems().length === 0) {
    showSaveStatus("The list is already empty.");
    return;
  }
  clearWarning.hidden = false;
  clearCancel.focus();
}

function hideClearWarning() {
  clearWarning.hidden = true;
}

function confirmClearList() {
  if (clearWarning.hidden) {
    return;
  }
  hideClearWarning();
  saveItems([]);
  editingId = null;
  renderItems([]);
  window.clearTimeout(saveStatusTimer);
  saveStatus.hidden = true;
  saveStatus.textContent = "";
}

function beginEdit(id) {
  if (editingId === id) {
    return;
  }
  if (editingId) {
    commitEdit();
  }
  editingId = id;
  renderItems(withIds(loadItems()));
  const input = todoList.querySelector(".todo-edit-input");
  if (!input) {
    return;
  }
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function commitEdit() {
  if (!editingId) {
    return;
  }
  const id = editingId;
  const input = todoList.querySelector(".todo-edit-input");
  const text = input ? fieldText(input.value) : "";
  editingId = null;
  const items = withIds(loadItems());
  const item = items.find((entry) => entry.id === id);
  if (item && text) {
    item.text = text;
    saveItems(items);
  }
  renderItems(items);
}

function cancelEdit() {
  editingId = null;
  renderItems(withIds(loadItems()));
  document.getElementById("add-input")?.focus();
}

function addItem() {
  const input = document.getElementById("add-input");
  const text = fieldText(input?.value);
  if (!text) {
    input?.focus();
    return;
  }
  if (editingId) {
    commitEdit();
  }

  const items = withIds(loadItems());
  items.push({
    id: crypto.randomUUID(),
    text,
    done: false,
    createdAt: new Date().toISOString(),
  });
  saveItems(items);
  renderItems(items);
  const addInput = document.getElementById("add-input");
  if (addInput) {
    addInput.value = "";
    addInput.focus();
  }
}

function bindDrag(grip, rowItem) {
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    rowItem.classList.add("is-dragging");
  });

  grip.addEventListener("pointermove", (event) => {
    if (!rowItem.classList.contains("is-dragging")) {
      return;
    }
    reorderFromPointer(rowItem, event.clientY);
    autoScroll(event.clientY);
  });

  const finish = () => {
    if (!rowItem.classList.contains("is-dragging")) {
      return;
    }
    rowItem.classList.remove("is-dragging");
    persistOrderFromDom();
  };

  grip.addEventListener("pointerup", finish);
  grip.addEventListener("pointercancel", finish);
}

function reorderFromPointer(dragEl, clientY) {
  const rows = [...todoList.querySelectorAll(".todo-item[data-id]")];
  let target = null;
  for (const el of rows) {
    if (el === dragEl) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) {
      target = el;
      break;
    }
  }

  const addRow = todoList.querySelector(".todo-add");
  if (target) {
    if (dragEl.nextElementSibling !== target) {
      todoList.insertBefore(dragEl, target);
    }
    return;
  }
  if (addRow && dragEl.nextElementSibling !== addRow) {
    todoList.insertBefore(dragEl, addRow);
  }
}

function autoScroll(clientY) {
  const scroller = todoList.closest(".log-scroll");
  if (!scroller) {
    return;
  }
  const rect = scroller.getBoundingClientRect();
  const edge = 40;
  if (clientY < rect.top + edge) {
    scroller.scrollTop -= 14;
  } else if (clientY > rect.bottom - edge) {
    scroller.scrollTop += 14;
  }
}

function sortItems(compare) {
  if (editingId) {
    commitEdit();
  }
  const items = withIds(loadItems());
  items.sort(compare);
  saveItems(items);
  renderItems(items);
}

function sortAlphabetically() {
  sortItems((a, b) =>
    a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: "base" })
  );
}

function sortByTime() {
  sortItems((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
}

function persistOrderFromDom() {
  const order = [...todoList.querySelectorAll(".todo-item[data-id]")].map((el) => el.dataset.id);
  const items = withIds(loadItems());
  const byId = new Map(items.map((item) => [item.id, item]));
  const next = order.map((id) => byId.get(id)).filter(Boolean);
  for (const item of items) {
    if (!next.includes(item)) {
      next.push(item);
    }
  }
  saveItems(next);
}

exportButton.addEventListener("click", exportList);
importButton.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", () => {
  const file = importInput.files?.[0];
  importInput.value = "";
  if (file) {
    importListFile(file);
  }
});
sortTimeButton.addEventListener("click", sortByTime);
sortAlphaButton.addEventListener("click", sortAlphabetically);
clearButton.addEventListener("click", showClearWarning);
clearCancel.addEventListener("click", hideClearWarning);
clearConfirm.addEventListener("click", confirmClearList);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !clearWarning.hidden) {
    event.preventDefault();
    hideClearWarning();
    document.getElementById("add-input")?.focus();
  }
});

renderItems(withIds(loadItems()));
