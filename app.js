const STORAGE_KEY = "todolist-items";
const DONE_BOTTOM_KEY = "todolist-done-bottom";

const exportButton = document.getElementById("export-button");
const importButton = document.getElementById("import-button");
const importInput = document.getElementById("import-input");
const donePlaceButton = document.getElementById("done-place");
const doneBottomButton = document.getElementById("done-bottom");
const sortManualButton = document.getElementById("sort-manual");
const sortAlphaButton = document.getElementById("sort-alpha");
const clearButton = document.createElement("button");
clearButton.type = "button";
clearButton.id = "clear-button";
clearButton.className = "save-button clear-button";
clearButton.textContent = "Clear";
const clearWarning = document.getElementById("clear-warning");
const clearCancel = document.getElementById("clear-cancel");
const clearConfirm = document.getElementById("clear-confirm");
const saveStatus = document.getElementById("save-status");
const todoList = document.getElementById("todo-list");

let editingId = null;
let doneAtBottom = localStorage.getItem(DONE_BOTTOM_KEY) === "1";
let listSort = "manual";

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
    grip.setAttribute("aria-label", `Reorder ${item.text}`);
    bindDrag(grip, rowItem);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-delete";
    remove.setAttribute("aria-label", `Delete ${item.text}`);
    remove.title = "Delete";
    remove.addEventListener("click", () => deleteItem(item.id));

    const controls = document.createElement("div");
    controls.className = "todo-controls";
    controls.append(grip, remove);
    row.append(check, text, controls);
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

  row.append(plus, input, clearButton);
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

function hideSaveStatus() {
  window.clearTimeout(saveStatusTimer);
  saveStatus.hidden = true;
  saveStatus.textContent = "";
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

  downloadTextFile(exportFilename(new Date()), itemsToText(items));
  hideSaveStatus();
}

function replaceList(items) {
  editingId = null;
  listSort = "manual";
  saveAndShow(items);
  hideSaveStatus();
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
  replaceList(imported);
}

function importListFile(file) {
  const reader = new FileReader();
  reader.onload = () => applyImportedList(String(reader.result || ""));
  reader.readAsText(file);
}

function visibleItems(items) {
  const ordered = listSort === "alpha" ? [...items].sort(compareAlpha) : [...items];
  if (!doneAtBottom) {
    return ordered;
  }
  return [...ordered.filter((item) => !item.done), ...ordered.filter((item) => item.done)];
}

function showItems(items) {
  renderItems(visibleItems(items));
  updateSortButton();
}

function saveAndShow(items) {
  saveItems(items);
  showItems(items);
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
  saveAndShow(items);
}

function deleteItem(id) {
  if (editingId === id) {
    editingId = null;
  } else if (editingId) {
    commitEdit();
  }
  const items = withIds(loadItems()).filter((item) => item.id !== id);
  saveAndShow(items);
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
  editingId = null;
  listSort = "manual";
  saveAndShow([]);
  hideSaveStatus();
}

function beginEdit(id) {
  if (editingId === id) {
    return;
  }
  if (editingId) {
    commitEdit();
  }
  editingId = id;
  showItems(withIds(loadItems()));
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
  showItems(withIds(loadItems()));
}

function cancelEdit() {
  editingId = null;
  showItems(withIds(loadItems()));
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
  saveAndShow(items);
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
    const pointerId = event.pointerId;
    grip.setPointerCapture(pointerId);

    const rows = [...todoList.querySelectorAll(".todo-item[data-id]")];
    const startIndex = rows.indexOf(rowItem);
    const metrics = rows.map((el) => {
      const rect = el.getBoundingClientRect();
      return { el, mid: rect.top + rect.height / 2, height: rect.height };
    });
    const startY = event.clientY;
    const scroller = todoList.closest(".log-scroll");
    const scrollStart = scroller ? scroller.scrollTop : 0;
    rowItem.classList.add("is-dragging");
    let newIndex = startIndex;

    const move = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const scrollDy = (scroller ? scroller.scrollTop : 0) - scrollStart;
      const pointer = moveEvent.clientY;
      let insertAt = metrics.length - 1;
      let seen = 0;
      for (let index = 0; index < metrics.length; index += 1) {
        if (index === startIndex) {
          continue;
        }
        const mid = metrics[index].mid - scrollDy;
        if (pointer < mid) {
          insertAt = seen;
          break;
        }
        seen += 1;
        insertAt = seen;
      }
      newIndex = boundedIndex(rows.map((el) => el.dataset.id), startIndex, insertAt);
      const shift = newIndex - startIndex;
      rows.forEach((el, index) => {
        if (index === startIndex) {
          el.style.transform = `translateY(${pointer - startY + scrollDy}px)`;
          return;
        }
        let offset = 0;
        if (shift < 0 && index >= newIndex && index < startIndex) {
          offset = metrics[startIndex].height;
        }
        if (shift > 0 && index > startIndex && index <= newIndex) {
          offset = -metrics[startIndex].height;
        }
        el.style.transform = offset ? `translateY(${offset}px)` : "";
      });
      autoScroll(pointer);
    };

    const finish = (endEvent) => {
      if (endEvent.pointerId !== pointerId) {
        return;
      }
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", finish);
      grip.removeEventListener("pointercancel", finish);
      rows.forEach((el) => {
        el.style.transform = "";
      });
      rowItem.classList.remove("is-dragging");
      if (newIndex === startIndex) {
        return;
      }
      const home = withIds(loadItems());
      const byId = new Map(home.map((item) => [item.id, item]));
      const visible = rows.map((el) => byId.get(el.dataset.id)).filter(Boolean);
      const [moved] = visible.splice(startIndex, 1);
      visible.splice(newIndex, 0, moved);
      listSort = "manual";
      saveAndShow(mergeDraggedOrder(home, visible));
    };

    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
  });
}

function boundedIndex(ids, from, to) {
  const byId = new Map(withIds(loadItems()).map((item) => [item.id, item]));
  const visible = ids.map((id) => byId.get(id)).filter(Boolean);
  let next = to;
  if (doneAtBottom && visible[from]) {
    const firstDone = visible.findIndex((item) => item.done);
    if (firstDone !== -1) {
      next = visible[from].done ? Math.max(firstDone, to) : Math.min(Math.max(firstDone - 1, 0), to);
    }
  }
  return Math.max(0, Math.min(Math.max(visible.length - 1, 0), next));
}

function mergeDraggedOrder(home, visible) {
  if (!doneAtBottom) {
    return visible;
  }
  const open = visible.filter((item) => !item.done);
  const done = visible.filter((item) => item.done);
  const next = home.slice();
  const openSlots = [];
  const doneSlots = [];
  next.forEach((item, index) => (item.done ? doneSlots : openSlots).push(index));
  open.forEach((item, index) => {
    next[openSlots[index]] = item;
  });
  done.forEach((item, index) => {
    next[doneSlots[index]] = item;
  });
  return next;
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

function compareAlpha(a, b) {
  return a.text.localeCompare(b.text, undefined, { numeric: true, sensitivity: "base" });
}

function setPressed(button, pressed) {
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
}

function updateSortButton() {
  const alpha = listSort === "alpha";
  setPressed(sortAlphaButton, alpha);
  setPressed(sortManualButton, !alpha);
}

function updateDoneButton() {
  setPressed(doneBottomButton, doneAtBottom);
  setPressed(donePlaceButton, !doneAtBottom);
}

function setDonePlacement(atBottom) {
  if (doneAtBottom === atBottom) {
    return;
  }
  doneAtBottom = atBottom;
  localStorage.setItem(DONE_BOTTOM_KEY, doneAtBottom ? "1" : "0");
  updateDoneButton();
  showItems(withIds(loadItems()));
}

function setSortMode(mode) {
  if (listSort === mode) {
    return;
  }
  if (editingId) {
    commitEdit();
  }
  listSort = mode;
  showItems(withIds(loadItems()));
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
donePlaceButton.addEventListener("click", () => setDonePlacement(false));
doneBottomButton.addEventListener("click", () => setDonePlacement(true));
sortManualButton.addEventListener("click", () => setSortMode("manual"));
sortAlphaButton.addEventListener("click", () => setSortMode("alpha"));
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

function alignRowControls() {
  const width = clearButton.getBoundingClientRect().width;
  if (width > 0) {
    document.documentElement.style.setProperty("--clear-width", `${width}px`);
  }
}

function equalizeTopButtons() {
  const buttons = [...document.querySelectorAll(".log-toolbar .save-button")];
  if (buttons.length === 0) {
    return;
  }
  buttons.forEach((button) => {
    button.style.width = "max-content";
    button.style.fontWeight = "700";
  });
  const widest = Math.ceil(Math.max(...buttons.map((button) => button.getBoundingClientRect().width)));
  buttons.forEach((button) => {
    button.style.width = `${widest}px`;
    button.style.fontWeight = "";
  });
}

window.addEventListener("resize", () => {
  equalizeTopButtons();
  alignRowControls();
});
updateDoneButton();
showItems(withIds(loadItems()));
equalizeTopButtons();
alignRowControls();
