/* Word-level diff used by the previous vs updated comparison view. */
(function (global) {
  "use strict";

  function tokenize(text) {
    return String(text || "").split(/(\s+)/).filter(function (t) { return t !== ""; });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function lcsTable(a, b) {
    var table = [];
    for (var i = 0; i <= a.length; i++) table.push(new Array(b.length + 1).fill(0));
    for (i = a.length - 1; i >= 0; i--) {
      for (var j = b.length - 1; j >= 0; j--) {
        table[i][j] = a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    return table;
  }

  /* Returns { oldHtml, newHtml } with removed/added words highlighted. */
  function diff(prev, next) {
    var a = tokenize(prev), b = tokenize(next);
    var table = lcsTable(a, b);
    var oldOut = "", newOut = "";
    var i = 0, j = 0;

    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        oldOut += escapeHtml(a[i]);
        newOut += escapeHtml(b[j]);
        i++; j++;
      } else if (table[i + 1][j] >= table[i][j + 1]) {
        oldOut += '<span class="del">' + escapeHtml(a[i]) + "</span>";
        i++;
      } else {
        newOut += '<span class="ins">' + escapeHtml(b[j]) + "</span>";
        j++;
      }
    }
    while (i < a.length) { oldOut += '<span class="del">' + escapeHtml(a[i++]) + "</span>"; }
    while (j < b.length) { newOut += '<span class="ins">' + escapeHtml(b[j++]) + "</span>"; }

    return { oldHtml: oldOut, newHtml: newOut };
  }

  global.APMDiff = { diff: diff, escapeHtml: escapeHtml };
})(window);
