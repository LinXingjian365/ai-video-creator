"use client";

import { useEffect, useMemo, useState } from "react";
import { EyeOff, Loader2, PlugZap, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";

interface ConfigField {
  key: string;
  label: string;
  help: string;
  secret?: boolean;
  kind?: "text" | "password" | "select";
  options?: string[];
  placeholder?: string;
  configured: boolean;
  value?: string;
}

interface ConfigGroup {
  id: string;
  title: string;
  description: string;
  fields: ConfigField[];
}

interface ConfigSnapshot {
  groups: ConfigGroup[];
}

interface ProbeResult {
  ok: boolean;
  provider: string;
  detail: string;
}

export function ConfigCenter({ onSaved }: { onSaved?: () => void }) {
  const [snapshot, setSnapshot] = useState<ConfigSnapshot | null>(null);
  const [activeGroupId, setActiveGroupId] = useState("llm");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [probing, setProbing] = useState(false);
  const [message, setMessage] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);

  async function loadSnapshot() {
    setLoading(true);
    try {
      const response = await fetch("/api/config/local", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "读取配置失败");
      setSnapshot(data);
      setDrafts((current) => {
        const next = { ...current };
        for (const field of (data as ConfigSnapshot).groups.flatMap((group) => group.fields)) {
          if (!field.secret) next[field.key] = field.value ?? "";
          else next[field.key] = "";
        }
        return next;
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取配置失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSnapshot();
  }, []);

  const activeGroup = useMemo(
    () => snapshot?.groups.find((group) => group.id === activeGroupId) ?? snapshot?.groups[0],
    [activeGroupId, snapshot]
  );

  async function saveActiveGroup() {
    if (!activeGroup) return;
    const values: Record<string, string> = {};
    for (const field of activeGroup.fields) {
      const value = drafts[field.key] ?? "";
      if (!field.secret || value.trim()) values[field.key] = value;
    }
    if (Object.keys(values).length === 0) {
      setMessage("当前分组没有需要保存的改动。");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/config/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "CONFIRM_LOCAL_CONFIG_WRITE", values })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "配置保存失败");
      setMessage(`已安全写入 ${data.updatedKeys.length} 项配置。`);
      await loadSnapshot();
      onSaved?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function probeLlm() {
    setProbing(true);
    setProbe(null);
    setMessage("");
    try {
      const response = await fetch("/api/config/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "llm", confirm: "CONFIRM_PROVIDER_PROBE" })
      });
      const data = await response.json();
      if (typeof data.ok !== "boolean") throw new Error(data.error ?? "模型探针失败");
      setProbe(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型探针失败");
    } finally {
      setProbing(false);
    }
  }

  if (loading && !snapshot) {
    return <div className="config-center-loading"><Loader2 className="spin" size={18} />读取本机配置状态</div>;
  }

  return (
    <section className="config-center" aria-labelledby="config-center-title">
      <header className="config-center-head">
        <div>
          <p><SlidersHorizontal size={16} /> 本机配置中心</p>
          <h3 id="config-center-title">把链路缺口逐项接通</h3>
        </div>
        <span className="config-security"><ShieldCheck size={16} />密钥不回显</span>
      </header>

      <div className="config-tabs" role="tablist" aria-label="配置分组">
        {snapshot?.groups.map((group) => {
          const ready = group.fields.filter((field) => field.configured).length;
          return (
            <button
              aria-selected={activeGroup?.id === group.id}
              className={activeGroup?.id === group.id ? "active" : ""}
              key={group.id}
              onClick={() => setActiveGroupId(group.id)}
              role="tab"
              type="button"
            >
              <span>{group.title}</span>
              <small>{ready}/{group.fields.length}</small>
            </button>
          );
        })}
      </div>

      {activeGroup ? (
        <div className="config-workspace" role="tabpanel">
          <div className="config-group-copy">
            <strong>{activeGroup.title}</strong>
            <span>{activeGroup.description}</span>
          </div>
          <div className="config-fields">
            {activeGroup.fields.map((field) => (
              <label className="config-field" key={field.key}>
                <span>
                  <strong>{field.label}</strong>
                  <code>{field.key}</code>
                  {field.secret ? <EyeOff aria-label="敏感配置" size={14} /> : null}
                  <i className={field.configured ? "configured" : "missing"}>{field.configured ? "已配置" : "未配置"}</i>
                </span>
                {field.kind === "select" ? (
                  <select
                    onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                    value={drafts[field.key] ?? ""}
                  >
                    <option value="">请选择</option>
                    {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    autoComplete={field.secret ? "new-password" : "off"}
                    onChange={(event) => setDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                    placeholder={field.secret && field.configured ? "已安全保存，输入新值可替换" : field.placeholder ?? ""}
                    type={field.secret ? "password" : "text"}
                    value={drafts[field.key] ?? ""}
                  />
                )}
                <small>{field.help}</small>
              </label>
            ))}
          </div>

          <div className="config-actions">
            <button className="primary-button" disabled={saving} onClick={saveActiveGroup} type="button">
              {saving ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
              {saving ? "保存中" : "保存当前分组"}
            </button>
            {activeGroup.id === "llm" ? (
              <button className="secondary-button" disabled={probing} onClick={probeLlm} type="button">
                {probing ? <Loader2 className="spin" size={17} /> : <PlugZap size={17} />}
                {probing ? "探测中" : "实测当前模型"}
              </button>
            ) : null}
            {message ? <span className="config-message">{message}</span> : null}
            {probe ? <span className={`config-probe ${probe.ok ? "ok" : "failed"}`}>{probe.provider} · {probe.detail}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
