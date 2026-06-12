// Art Tool 0-E：後台前端腳本（外部檔、非 inline、無 CDN）。
// dry-run 驗證、送出生成、輪詢 job、候選圖 grid、mark/adopt。
// 玩家端完全不使用本檔；本檔只在製作端後台載入。
(function () {
  "use strict";

  var form = document.getElementById("dry-run-form");
  var dryOut = document.getElementById("dry-run-result");
  var genBtn = document.getElementById("generate-btn");
  var jobPanel = document.getElementById("job-panel");
  var jobEmpty = document.getElementById("job-empty");
  var grid = document.getElementById("candidate-grid");
  var gridEmpty = document.getElementById("candidate-empty");
  var reloadBtn = document.getElementById("reload-candidates");

  function formData() {
    var d = new FormData(form);
    d.delete("checkpoint"); // dry-run 不驗 checkpoint
    return d;
  }

  // ---- Dry Run ----
  if (form && dryOut) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      fetch("/api/dry-run-form", { method: "POST", body: formData() })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          dryOut.hidden = false;
          dryOut.classList.remove("ok", "bad");
          dryOut.classList.add(j.ok ? "ok" : "bad");
          dryOut.textContent = JSON.stringify(j, null, 2);
        })
        .catch(function (e) {
          dryOut.hidden = false;
          dryOut.classList.add("bad");
          dryOut.textContent = "Dry run 請求失敗：" + e;
        });
    });
  }

  // ---- Generate ----
  var pollTimer = null;
  function renderJob(j) {
    if (jobEmpty) jobEmpty.hidden = true;
    jobPanel.hidden = false;
    var lines = [
      "job_id: " + (j.job_id || "-"),
      "status: " + (j.status || "-"),
      "message: " + (j.message || "-"),
    ];
    if (j.output_files && j.output_files.length) {
      lines.push("files: " + j.output_files.length + " 張");
    }
    if (j.warnings && j.warnings.length) {
      lines.push("warnings: " + j.warnings.join(" | "));
    }
    jobPanel.textContent = lines.join("\n");
    jobPanel.className = "job-panel job-" + (j.status || "");
  }

  function pollJob(jobId) {
    fetch("/api/jobs/" + encodeURIComponent(jobId))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        renderJob(j);
        if (j.status === "completed" || j.status === "failed") {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          loadCandidates();
        }
      })
      .catch(function () { /* 下次輪詢再試 */ });
  }

  if (genBtn && !genBtn.disabled) {
    genBtn.addEventListener("click", function () {
      genBtn.disabled = true;
      fetch("/api/generate", { method: "POST", body: new FormData(form) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          renderJob(j);
          if (j.ok && j.job_id) {
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(function () { pollJob(j.job_id); }, 2000);
          }
        })
        .catch(function (e) {
          if (jobEmpty) jobEmpty.hidden = true;
          jobPanel.hidden = false;
          jobPanel.textContent = "生成請求失敗：" + e;
        })
        .finally(function () { genBtn.disabled = false; });
    });
  }

  // ---- Candidate grid ----
  var PROBLEMS = ["臉不一致", "手壞", "不夠可愛", "太幼", "太成熟", "構圖弱", "風格不對"];

  function card(item) {
    var el = document.createElement("div");
    el.className = "cand-card status-" + (item.status || "candidate");
    var img = item.public_path
      ? '<img src="' + item.public_path + '" alt="candidate" loading="lazy">'
      : '<div class="noimg">no image</div>';
    el.innerHTML =
      img +
      '<div class="cand-meta">' +
      "<div>" + (item.character_id || "") + " / " + (item.task_id || "") + "</div>" +
      "<div>style: " + (item.style_id || "-") + "</div>" +
      "<div>seed: " + (item.seed == null ? "-" : item.seed) + "</div>" +
      "<div>ckpt: " + (item.checkpoint || "-") + "</div>" +
      "<div>status: <b>" + (item.status || "-") + "</b></div>" +
      "<div class=\"muted\">" + (item.created_at || "") + "</div>" +
      "</div>";

    var actions = document.createElement("div");
    actions.className = "cand-actions";
    [["accepted", "採用標記"], ["rejected", "拒絕"], ["candidate", "重設"]].forEach(function (p) {
      var b = document.createElement("button");
      b.className = "btn btn-sm";
      b.textContent = p[1];
      b.addEventListener("click", function () { mark(item.asset_id, p[0]); });
      actions.appendChild(b);
    });
    var probSel = document.createElement("select");
    probSel.className = "prob-sel";
    probSel.innerHTML = '<option value="">標記問題…</option>' +
      PROBLEMS.map(function (p) { return '<option value="' + p + '">' + p + "</option>"; }).join("");
    probSel.addEventListener("change", function () {
      if (probSel.value) mark(item.asset_id, "problem", probSel.value);
    });
    actions.appendChild(probSel);

    var adoptBtn = document.createElement("button");
    adoptBtn.className = "btn btn-primary btn-sm";
    adoptBtn.textContent = "採用 (adopt)";
    adoptBtn.addEventListener("click", function () { adopt(item.asset_id); });
    actions.appendChild(adoptBtn);

    el.appendChild(actions);
    return el;
  }

  function loadCandidates() {
    if (!grid) return;
    fetch("/api/generated")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        grid.innerHTML = "";
        var items = (j && j.items) || [];
        if (gridEmpty) gridEmpty.hidden = items.length > 0;
        items.forEach(function (it) { grid.appendChild(card(it)); });
      })
      .catch(function () { /* 略 */ });
  }

  function mark(assetId, status, problem) {
    var body = new FormData();
    body.append("status", status);
    if (problem) body.append("problems", problem);
    fetch("/api/generated/" + encodeURIComponent(assetId) + "/mark", { method: "POST", body: body })
      .then(function (r) { return r.json(); })
      .then(function () { loadCandidates(); });
  }

  function adopt(assetId) {
    fetch("/api/generated/" + encodeURIComponent(assetId) + "/adopt", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) alert("採用失敗：" + (j.message || "") + "\n" + (j.warnings || []).join("\n"));
        loadCandidates();
      });
  }

  if (reloadBtn) reloadBtn.addEventListener("click", loadCandidates);
  loadCandidates();
})();
