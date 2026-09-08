window.__ModuleLoader__.load({ id: 'skill-hub', factory: (require) => { var module = { exports: {} }; var exports = module.exports;

// src/client/index.js
var React = (() => {
  try {
    return require("react");
  } catch {
    return typeof window !== "undefined" && window.React || null;
  }
})();
function fetchGroups() {
  return fetch("/api/skill-hub/list", { headers: { accept: "application/json" } }).then((res) => {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }).then((data) => data && data.groups || []);
}
function SkillPicker(props) {
  const useInput = props.useInput;
  const input = useInput ? useInput((s) => s) : null;
  const latest = React.useRef({});
  latest.current = { draft: input && typeof input.draft === "string" ? input.draft : "" };
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [state, setState] = React.useState({ loading: false, error: null, groups: [] });
  const wrapRef = React.useRef(null);
  const load = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchGroups().then((groups) => setState({ loading: false, error: null, groups })).catch((err) => setState({ loading: false, error: String(err && err.message || err), groups: [] }));
  }, []);
  React.useEffect(() => {
    if (open && state.groups.length === 0 && !state.loading && !state.error) load();
  }, [open, state, load]);
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);
  const insert = (name) => {
    try {
      const a = props.inputActions;
      if (a && typeof a.setDraft === "function") {
        const token = "@" + name;
        const base = String(latest.current.draft || "");
        const refs = [];
        const body = [];
        for (const line of base.split(/\r?\n/)) {
          const kept = line.replace(/(^|\s)@[^\s]+/g, (m, pre) => {
            refs.push(m.slice(pre.length));
            return pre === "" ? "" : " ";
          });
          body.push(kept);
        }
        if (refs.indexOf(token) === -1) refs.push(token);
        const bodyText = body.join("\n").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
        const next = refs.join(" ") + (bodyText ? " " + bodyText : "");
        a.setDraft(next);
      } else if (a && typeof a.insertText === "function") a.insertText("@" + name);
      else if (a && typeof a.append === "function") a.append("@" + name);
    } catch (_) {
    }
    setOpen(false);
  };
  const q = query.trim().toLowerCase();
  const match = (s) => !q || s.name.toLowerCase().includes(q) || s.description && s.description.toLowerCase().includes(q);
  return React.createElement(
    "div",
    { className: "skhub_wrap", ref: wrapRef },
    React.createElement("button", {
      type: "button",
      className: "skhub_btn",
      title: "\u6280\u80FD\u5E93\uFF08\u70B9\u51FB\u5C55\u5F00\u4E09\u7AEF\u6280\u80FD\u5217\u8868\uFF09",
      onClick: () => setOpen((o) => !o)
    }, "\u{1F9E9} \u6280\u80FD"),
    open && React.createElement(
      "div",
      { className: "skhub_panel" },
      React.createElement(
        "div",
        { className: "skhub_head" },
        React.createElement("span", null, "\u6280\u80FD\u5E93"),
        state.loading && React.createElement("span", { className: "skhub_hint" }, "\u52A0\u8F7D\u4E2D\u2026")
      ),
      React.createElement("input", {
        type: "text",
        className: "skhub_search",
        placeholder: "\u641C\u7D22\u6280\u80FD\u540D\u6216\u7B80\u4ECB\u2026",
        value: query,
        onChange: (e) => setQuery(e.target.value)
      }),
      state.error && React.createElement("div", { className: "skhub_err" }, "\u8BFB\u53D6\u5931\u8D25\uFF1A" + state.error),
      !state.loading && !state.error && state.groups.map((g) => {
        const skills = (g.skills || []).filter(match);
        return React.createElement(
          "div",
          { className: "skhub_group", key: g.id },
          React.createElement("div", { className: "skhub_group_title" }, g.label + "\uFF08" + skills.length + "\uFF09"),
          React.createElement(
            "div",
            { className: "skhub_list" },
            skills.length ? skills.map((s) => React.createElement(
              "div",
              { className: "skhub_item", key: s.name, onClick: () => insert(s.name) },
              React.createElement("div", { className: "skhub_item_name" }, s.name),
              s.description && React.createElement("div", { className: "skhub_item_desc" }, s.description)
            )) : React.createElement("div", { className: "skhub_hint" }, g.error ? "\u8BFB\u53D6\u5931\u8D25" : q ? "\u65E0\u5339\u914D\u6280\u80FD" : "\uFF08\u7A7A\uFF09")
          )
        );
      })
    )
  );
}
module.exports = {
  inject: ["slots", "connection"],
  apply(ctx) {
    const slots = ctx.slots;
    const sheet = document.createElement("style");
    sheet.textContent = `
.skhub_wrap { position: relative; display: inline-block; }
.skhub_btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border, #2a2f3a); background: var(--bg-elev, #1b1f27);
  color: var(--text, #e6e6e6); font-size: 12px; line-height: 18px;
}
.skhub_btn:hover { background: var(--bg-elev-2, #232833); }
.skhub_panel {
  position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 50;
  width: 340px; max-height: 420px; overflow-y: auto;
  border: 1px solid var(--border, #2a2f3a); border-radius: 8px;
  background: var(--bg-elev, #1b1f27); box-shadow: 0 8px 24px rgba(0,0,0,.35);
  padding: 8px; color: var(--text, #e6e6e6); font-size: 12px;
}
.skhub_head { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 6px; }
.skhub_search {
  width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 4px 8px;
  border-radius: 6px; border: 1px solid var(--border, #2a2f3a);
  background: var(--bg-elev-2, #232833); color: var(--text, #e6e6e6);
  font-size: 12px; outline: none;
}
.skhub_search:focus { border-color: var(--accent, #3a6df0); }
.skhub_group { margin-bottom: 10px; }
.skhub_group_title { opacity: .8; font-weight: 600; margin-bottom: 4px; }
.skhub_list { display: flex; flex-direction: column; gap: 4px; }
.skhub_item {
  padding: 5px 8px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--border, #2a2f3a); background: var(--bg-elev-2, #232833);
}
.skhub_item:hover { border-color: var(--accent, #3a6df0); }
.skhub_item_name { font-weight: 600; }
.skhub_item_desc {
  opacity: .6; margin-top: 2px; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.skhub_hint { opacity: .6; }
.skhub_err { color: #ff6b6b; }
/* Companion UI fix: align the at-file reference rail (the pill row above the
   composer once the draft contains @references) with the composer card's
   left edge - the dock slot renders without the card's side clearance.
   Mirrors the hero shell's width/centering contract in the core styles. */
.dsh_atFile_rail { width: min(calc(var(--dsh-composer-card-max-width, 752px) + 2 * var(--dsh-composer-side-clearance, 16px)), 100%); align-self: center; box-sizing: border-box; padding: 0 var(--dsh-composer-side-clearance, 16px); }
`;
    document.head.appendChild(sheet);
    slots.inject("conversation.input.left", () => slots.register(
      { name: "conversation.input.left", id: "skill-hub", order: 20 },
      (props) => React.createElement(SkillPicker, { inputActions: props.inputActions, useInput: props.useInput })
    ));
  }
};
return module.exports; } });
//# sourceMappingURL=client.js.map
