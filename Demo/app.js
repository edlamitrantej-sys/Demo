/*
 * Front-end workflow prototype. Predictions below are a transparent filename
 * demo heuristic; a trained classifier API should replace classifyDemo().
 */
const routes = {
  Invoice: "Accounts payable",
  Form: "Data entry team",
  Letter: "Correspondence",
  Certificate: "Records archive",
  Unfamiliar: "Human review"
};
const cues = {
  Invoice: ["invoice", "bill", "receipt", "payment"],
  Form: ["form", "application", "claim", "registration"],
  Letter: ["letter", "memo", "notice", "correspondence"],
  Certificate: ["certificate", "diploma", "award", "license"]
};
const state = { file: null, imageUrl: null, type: "Unfamiliar", confidence: 0, quality: "ready", queued: new Map() };
const fileInput = document.querySelector("#file-input");
const dropzone = document.querySelector("#dropzone");
const threshold = document.querySelector("#threshold-slider");

function classifyDemo(fileName) {
  const name = fileName.toLowerCase();
  const found = Object.entries(cues).find(([, words]) => words.some(word => name.includes(word)));
  if (!found) return { type: "Unfamiliar", confidence: 38, explanation: "No familiar filename cue. This prototype uses filename hints only; an actual model should classify the page image." };
  const [type, words] = found;
  const exact = words.some(word => name.includes(word));
  return { type, confidence: exact ? 91 : 78, explanation: "Prototype suggestion from the filename. Connect a trained image model for real document recognition." };
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function receiveFile(file) {
  if (!file) return;
  const valid = ["image/jpeg", "image/png", "image/webp", "image/bmp"];
  if (!valid.includes(file.type)) {
    window.alert("Please choose an image file (JPG, PNG, WEBP or BMP). PDFs can be added when the document preprocessing backend is connected.");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    window.alert("This demo accepts images up to 10 MB. Resize the image and try again.");
    return;
  }
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.file = file;
  state.imageUrl = URL.createObjectURL(file);
  const suggestion = classifyDemo(file.name);
  state.type = suggestion.type;
  state.confidence = suggestion.confidence;
  state.quality = "ready";

  const image = new Image();
  image.onload = () => {
    const poorDimensions = image.naturalWidth < 200 || image.naturalHeight < 200;
    const oddRatio = Math.max(image.naturalWidth / image.naturalHeight, image.naturalHeight / image.naturalWidth) > 5;
    if (poorDimensions || oddRatio) {
      state.quality = "poor";
      state.type = "Unfamiliar";
      state.confidence = 0;
      document.querySelector("#quality-badge").textContent = "! Check quality";
      document.querySelector("#quality-badge").classList.add("warn");
    } else {
      document.querySelector("#quality-badge").textContent = "✓ Image ready";
      document.querySelector("#quality-badge").classList.remove("warn");
    }
    renderResult(file, image.naturalWidth, image.naturalHeight, suggestion.explanation);
  };
  image.onerror = () => {
    state.quality = "poor";
    state.type = "Unfamiliar";
    state.confidence = 0;
    renderResult(file, 0, 0, "This image could not be read. Send it for human review.");
  };
  image.src = state.imageUrl;
}

function renderResult(file, width, height, explanation) {
  document.querySelector("#result-panel").hidden = false;
  document.querySelector("#file-name").textContent = file.name;
  document.querySelector("#file-details").textContent = `${width && height ? `${width} × ${height} px · ` : "Unreadable image · "}${formatBytes(file.size)}`;
  const thumb = document.querySelector("#file-thumb");
  thumb.style.backgroundImage = `url("${state.imageUrl}")`;
  thumb.innerHTML = "";
  const note = state.quality === "poor" ? "Image quality is too low for routing. Send it to human review." : explanation;
  document.querySelector("#decision-note").textContent = note;
  renderPrediction();
  updateThreshold();
  document.querySelector("#success-message").hidden = true;
  document.querySelector("#route-button").disabled = false;
  document.querySelector("#route-button").innerHTML = 'Confirm &amp; route <span>→</span>';
}

function renderPrediction() {
  const needsReview = state.quality === "poor" || state.type === "Unfamiliar" || state.confidence < Number(threshold.value);
  document.querySelector("#prediction").textContent = needsReview && state.quality !== "poor" && state.type !== "Unfamiliar" ? `${state.type} · review` : state.type;
  document.querySelector("#confidence-value").textContent = `${state.confidence}%`;
  document.querySelector("#confidence-fill").style.width = `${state.confidence}%`;
  document.querySelector("#confidence-fill").style.background = needsReview ? "#d3a75e" : "#8fac69";
  document.querySelector("#destination").textContent = needsReview ? routes.Unfamiliar : routes[state.type];
  document.querySelector("#route-button").innerHTML = needsReview ? 'Send to review <span>→</span>' : 'Confirm &amp; route <span>→</span>';
  document.querySelector("#decision-note").classList.toggle("review", needsReview);
  if (needsReview && state.quality === "ready" && state.type !== "Unfamiliar") {
    document.querySelector("#decision-note").textContent = `Below the ${threshold.value}% threshold. Send to human review so someone can confirm the type.`;
  }
}

function updateThreshold() {
  const value = threshold.value;
  document.querySelector("#threshold-label").textContent = `${value}%`;
  const percent = ((value - threshold.min) / (threshold.max - threshold.min)) * 100;
  threshold.style.background = `linear-gradient(to right,#6c9965 ${percent}%,#e8eae3 ${percent}%)`;
  if (state.file) renderPrediction();
}

function addToQueue(fileName, type, confidence, reason) {
  const key = `${fileName}-${Date.now()}`;
  state.queued.set(key, { fileName, type, confidence, reason });
  renderQueue();
}

function renderQueue() {
  const list = document.querySelector("#review-list");
  list.replaceChildren();
  document.querySelector("#queue-counter").textContent = `${state.queued.size} waiting`;
  document.querySelector("#empty-queue").hidden = state.queued.size > 0;
  for (const [key, item] of state.queued) {
    const row = document.createElement("div");
    row.className = "review-item";
    const icon = document.createElement("span"); icon.className = "review-file"; icon.textContent = "▧";
    const copy = document.createElement("div"); copy.className = "review-copy";
    const name = document.createElement("strong"); name.textContent = item.fileName;
    const reason = document.createElement("span"); reason.textContent = item.reason;
    copy.append(name, reason);
    const action = document.createElement("button"); action.textContent = "Resolve";
    action.addEventListener("click", () => { state.queued.delete(key); renderQueue(); });
    row.append(icon, copy, action); list.append(row);
  }
}

fileInput.addEventListener("change", event => receiveFile(event.target.files[0]));
dropzone.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); } });
for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.add("dragging"); });
for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove("dragging"); });
dropzone.addEventListener("drop", event => receiveFile(event.dataTransfer.files[0]));
threshold.addEventListener("input", updateThreshold);
document.querySelector("#route-button").addEventListener("click", () => {
  if (!state.file) return;
  const needsReview = state.quality === "poor" || state.type === "Unfamiliar" || state.confidence < Number(threshold.value);
  if (needsReview) {
    const reason = state.quality === "poor" ? "Unreadable · quality check" : state.type === "Unfamiliar" ? "Unfamiliar document · review" : `Low confidence · ${state.confidence}%`;
    addToQueue(state.file.name, state.type, state.confidence, reason);
    document.querySelector("#success-copy").textContent = "Added to the human review queue.";
  } else {
    document.querySelector("#success-copy").textContent = `Added to ${routes[state.type]}.`;
  }
  document.querySelector("#success-message").hidden = false;
  document.querySelector("#route-button").disabled = true;
});

const modal = document.querySelector("#type-modal");
document.querySelector("#change-button").addEventListener("click", () => { modal.hidden = false; });
document.querySelector("#modal-close").addEventListener("click", () => { modal.hidden = true; });
modal.addEventListener("click", event => { if (event.target === modal) modal.hidden = true; });
document.querySelectorAll(".type-options button").forEach(button => button.addEventListener("click", () => {
  state.type = button.dataset.type;
  state.confidence = state.type === "Unfamiliar" ? 20 : 100;
  state.quality = "ready";
  document.querySelector("#quality-badge").textContent = "✓ Manually checked";
  document.querySelector("#quality-badge").classList.remove("warn");
  document.querySelector("#decision-note").textContent = state.type === "Unfamiliar" ? "Unfamiliar documents always go to human review." : "Type corrected by reviewer. Confirm to route this document.";
  document.querySelector("#route-button").disabled = false;
  document.querySelector("#success-message").hidden = true;
  renderPrediction();
  modal.hidden = true;
}));
document.querySelector("#clear-button").addEventListener("click", () => {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.file = null; state.imageUrl = null; state.type = "Unfamiliar"; state.confidence = 0; state.quality = "ready";
  fileInput.value = "";
  document.querySelector("#result-panel").hidden = true;
});
updateThreshold();
